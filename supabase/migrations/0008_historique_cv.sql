-- Historique des CV adaptés (facultatif, comptes connectés uniquement).
--
-- La personne choisit d'enregistrer un CV adapté. On garde le texte du CV, les modifications
-- acceptées et les réglages d'export (modèle, mise en page) : le PDF et le Word sont recréés à la
-- demande, aucun fichier n'est stocké. Conservation 90 jours, puis suppression automatique.
-- Chacun ne voit, n'ajoute et ne supprime que ses propres lignes (RLS). Pas de modification.

create table if not exists public.cv_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  offer_title text not null check (char_length(offer_title) between 1 and 300),
  company     text check (char_length(company) <= 200),
  score       smallint check (score between 0 and 100),
  file_name   text not null check (char_length(file_name) between 1 and 300),
  template    text not null check (template in ('original', 'classique', 'moderne', 'minimaliste')),
  layout      text not null check (layout in ('compact', 'detailed')),
  resume      jsonb not null check (pg_column_size(resume) < 1500000),
  accepted    jsonb not null default '{}'::jsonb check (pg_column_size(accepted) < 500000),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '90 days'
);
create index if not exists cv_history_user on public.cv_history (user_id, created_at desc);
create index if not exists cv_history_expiry on public.cv_history (expires_at);

alter table public.cv_history enable row level security;
revoke all on table public.cv_history from public, anon, authenticated;
grant select, insert, delete on table public.cv_history to authenticated;

create policy cv_history_own_read on public.cv_history for select to authenticated
  using ((select auth.uid()) = user_id and expires_at > now());
create policy cv_history_own_insert on public.cv_history for insert to authenticated
  with check ((select auth.uid()) = user_id and expires_at <= now() + interval '91 days');
create policy cv_history_own_delete on public.cv_history for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 50 CV au maximum par compte (protection contre les abus)
create or replace function public.cv_history_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.cv_history where user_id = new.user_id) >= 50 then
    raise exception 'history_full' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists cv_history_limit on public.cv_history;
create trigger cv_history_limit before insert on public.cv_history
  for each row execute function public.cv_history_limit();

-- Suppression automatique après 90 jours (chaque nuit à 3 h 17)
create extension if not exists pg_cron;
select cron.schedule('cv-history-cleanup', '17 3 * * *', $$delete from public.cv_history where expires_at < now()$$);
