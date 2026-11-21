-- Une analyse qui échoue (erreur de l'IA, connexion coupée) ne doit pas être décomptée :
-- sinon le visiteur perd son essai gratuit, ou la personne une adaptation du mois, sans rien
-- avoir reçu.
--
-- 1. claim_analysis_id() : comme claim_analysis(), mais renvoie aussi un « bon » secret qui
--    permet de rendre CETTE réservation. Le bon est rangé dans analysis_refunds, une table que
--    personne ne peut lire (RLS sans règle) : seul l'appelant (le serveur) le connaît. On ne
--    peut donc pas se faire rembourser une analyse réussie.
-- 2. refund_analysis(bon) : rend la réservation si elle a moins de 15 minutes.
-- 3. rate_refund('trial', clé) : rend l'essai gratuit d'un visiteur sans compte (clé = empreinte
--    secrète de son adresse IP, calculée par le serveur ; elle n'est jamais envoyée au navigateur).

create table if not exists public.analysis_refunds (
  token      uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.usage_events (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.analysis_refunds enable row level security;
revoke all on table public.analysis_refunds from public, anon, authenticated;

create or replace function public.claim_analysis_id(out remaining integer, out refund_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  quota integer;
  used integer;
  event uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('analysis:' || uid::text));
  -- Ménage : un bon ne sert que quelques minutes
  delete from public.analysis_refunds where created_at < now() - interval '1 day';
  if exists (select 1 from public.profiles where id = uid and role = 'admin') then
    -- Administrateur : pas de limite (999 = illimité pour l'application)
    remaining := 999;
  else
    select analyses_quota into quota from public.plans where tier = 'free';
    quota := coalesce(quota, 5);
    select count(*) into used from public.usage_events
      where user_id = uid and kind = 'analysis' and created_at >= date_trunc('month', now());
    if used >= quota then
      remaining := -1;
      refund_token := null;
      return;
    end if;
    remaining := quota - used - 1;
  end if;
  insert into public.usage_events (user_id, kind) values (uid, 'analysis') returning id into event;
  insert into public.analysis_refunds (event_id) values (event) returning token into refund_token;
end;
$$;
revoke execute on function public.claim_analysis_id() from public, anon;
grant execute on function public.claim_analysis_id() to authenticated;

create or replace function public.refund_analysis(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event uuid;
begin
  select r.event_id into event
    from public.analysis_refunds r
    join public.usage_events e on e.id = r.event_id
    where r.token = p_token and e.user_id = auth.uid() and r.created_at > now() - interval '15 minutes';
  if event is null then
    return false;
  end if;
  delete from public.usage_events where id = event; -- le bon disparaît avec (on delete cascade)
  return true;
end;
$$;
revoke execute on function public.refund_analysis(uuid) from public, anon;
grant execute on function public.refund_analysis(uuid) to authenticated;

create or replace function public.rate_refund(p_bucket text, p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Seul l'essai gratuit peut être rendu (pas les autres limites de protection)
  if p_bucket <> 'trial' or p_key !~ '^[A-Za-z0-9_:-]{1,100}$' then
    raise exception 'invalid_rate_refund' using errcode = '22023';
  end if;
  delete from public.rate_hits
    where ctid = (
      select ctid from public.rate_hits
      where bucket = p_bucket and key = p_key and created_at > now() - interval '15 minutes'
      order by created_at desc
      limit 1
    );
  return found;
end;
$$;
revoke execute on function public.rate_refund(text, text) from public;
grant execute on function public.rate_refund(text, text) to anon, authenticated;
