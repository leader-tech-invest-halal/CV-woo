-- Limites d'usage durables (protection du budget IA) et quota sans « course ».
--
-- 1. rate_hits : un compteur par « clé » (empreinte anonyme d'une adresse IP ou d'un compte,
--    jamais l'adresse elle-même) et par type d'action. Aucune donnée personnelle lisible.
--    Personne ne peut lire ni écrire la table directement (RLS sans aucune règle) : seule la
--    fonction rate_hit() y touche.
-- 2. rate_hit() : vérifie et compte une action en une seule opération verrouillée.
--    Elle ne peut que refuser ou compter : l'appeler directement ne donne accès à rien.
-- 3. claim_analysis() : réserve une analyse sur le quota mensuel de la personne connectée,
--    de façon atomique (10 analyses lancées en même temps ne passent plus toutes).

create table if not exists public.rate_hits (
  bucket     text        not null,
  key        text        not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_hits_lookup on public.rate_hits (bucket, key, created_at);
create index if not exists rate_hits_age on public.rate_hits (created_at);

alter table public.rate_hits enable row level security;
revoke all on table public.rate_hits from public, anon, authenticated;

create or replace function public.rate_hit(p_bucket text, p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_bucket !~ '^[a-z0-9_-]{1,32}$' or p_key !~ '^[A-Za-z0-9_:-]{1,100}$'
     or p_max not between 1 and 1000 or p_window_seconds not between 1 and 2678400 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_key));
  -- Ménage : rien n'est gardé plus de 31 jours
  delete from public.rate_hits where created_at < now() - interval '31 days';
  select count(*) into n from public.rate_hits
    where bucket = p_bucket and key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    return false;
  end if;
  insert into public.rate_hits (bucket, key) values (p_bucket, p_key);
  return true;
end;
$$;
revoke execute on function public.rate_hit(text, text, integer, integer) from public;
grant execute on function public.rate_hit(text, text, integer, integer) to anon, authenticated;

create or replace function public.claim_analysis()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  quota integer;
  used integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('analysis:' || uid::text));
  select analyses_quota into quota from public.plans where tier = 'free';
  quota := coalesce(quota, 5);
  select count(*) into used from public.usage_events
    where user_id = uid and kind = 'analysis' and created_at >= date_trunc('month', now());
  if used >= quota then
    return -1; -- quota atteint
  end if;
  insert into public.usage_events (user_id, kind) values (uid, 'analysis');
  return quota - used - 1; -- analyses restantes après celle-ci
end;
$$;
revoke execute on function public.claim_analysis() from public, anon;
grant execute on function public.claim_analysis() to authenticated;
