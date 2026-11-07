-- =============================================================
-- CV Woo — Schéma initial (étape 3)
-- À exécuter dans Supabase : SQL Editor → coller → Run
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- Types ----------
create type public.plan_tier as enum ('free', 'pro', 'premium');
create type public.app_role as enum ('user', 'admin');
create type public.subscription_status as enum
  ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid');
create type public.analysis_status as enum
  ('pending', 'comparing', 'recommending', 'optimizing', 'done', 'failed');
create type public.template_key as enum
  ('professionnel', 'moderne', 'minimaliste', 'etudiant');
create type public.doc_format as enum ('pdf', 'docx');
create type public.usage_kind as enum ('analysis', 'generation', 'cover_letter');
create type public.application_status as enum
  ('a_envoyer', 'envoyee', 'entretien', 'refusee', 'acceptee');

-- ---------- Utilitaires ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Plans (configurables depuis l'admin) ----------
create table public.plans (
  tier                  public.plan_tier primary key,
  name                  text not null,
  price_monthly_cents   integer not null default 0 check (price_monthly_cents >= 0),
  currency              text not null default 'eur',
  stripe_price_id       text,
  quota_period          text not null check (quota_period in ('lifetime', 'month')),
  analyses_quota        integer,          -- null = illimité
  generations_quota     integer,          -- null = illimité
  templates             public.template_key[] not null,
  docx_export           boolean not null default false,
  history               boolean not null default false,
  cover_letter          boolean not null default false,
  applications_tracking boolean not null default false,
  is_active             boolean not null default true,
  updated_at            timestamptz not null default now()
);
create trigger plans_updated before update on public.plans
  for each row execute function public.set_updated_at();

-- Valeurs de départ : à ajuster depuis la page admin
insert into public.plans
  (tier, name, price_monthly_cents, quota_period, analyses_quota, generations_quota,
   templates, docx_export, history, cover_letter, applications_tracking)
values
  ('free',    'Free',    0,    'lifetime', 1,  1,
   '{professionnel}', false, false, false, false),
  ('pro',     'Pro',     900,  'month',    20, 40,
   '{professionnel,moderne,minimaliste,etudiant}', true, true, false, false),
  ('premium', 'Premium', 1900, 'month',    60, null,
   '{professionnel,moderne,minimaliste,etudiant}', true, true, true, true);

-- ---------- Profils ----------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text,
  locale             text not null default 'fr' check (locale in ('fr', 'en')),
  role               public.app_role not null default 'user',
  retention_days     integer not null default 90 check (retention_days between 1 and 365),
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crée le profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'locale', 'fr')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Empêche un utilisateur de se donner le rôle admin ou de modifier son id Stripe
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    new.role := old.role;
    new.stripe_customer_id := old.stripe_customer_id;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------- Abonnements (écrits uniquement par le webhook Stripe) ----------
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  tier                   public.plan_tier not null,
  status                 public.subscription_status not null,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on public.subscriptions (user_id);
create trigger subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------- CV importés ----------
create table public.resumes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  title                text not null,
  file_name            text not null,
  storage_path         text not null,   -- <user_id>/<resume_id>.<ext> dans le bucket "cvs"
  mime_type            text not null check (mime_type in (
                         'application/pdf',
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes           integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  raw_text             text,
  extracted            jsonb,           -- ResumeData (étape 1)
  extraction_confirmed boolean not null default false,
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.resumes (user_id);
create index on public.resumes (expires_at);
create trigger resumes_updated before update on public.resumes
  for each row execute function public.set_updated_at();

-- ---------- Offres d'emploi ----------
create table public.job_offers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  job_title  text not null,
  company    text,
  raw_text   text not null check (char_length(raw_text) <= 30000),
  parsed     jsonb,                     -- JobOfferData (étape 2)
  created_at timestamptz not null default now()
);
create index on public.job_offers (user_id);

-- ---------- Analyses CV / offre ----------
create table public.analyses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  resume_id       uuid not null references public.resumes (id) on delete cascade,
  job_offer_id    uuid not null references public.job_offers (id) on delete cascade,
  status          public.analysis_status not null default 'pending',
  match_score     smallint check (match_score between 0 and 100),
  comparison      jsonb,                -- étape 3
  recommendations jsonb,                -- étape 4
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.analyses (user_id, created_at desc);
create trigger analyses_updated before update on public.analyses
  for each row execute function public.set_updated_at();

-- ---------- Versions de CV (optimisées ou éditées) ----------
create table public.resume_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  resume_id   uuid not null references public.resumes (id) on delete cascade,
  analysis_id uuid references public.analyses (id) on delete set null,
  label       text not null default 'Version optimisée',
  template    public.template_key not null default 'professionnel',
  content     jsonb not null,           -- ResumeData final
  changes     jsonb,                    -- modifications + explications (avant/après)
  flags       jsonb,                    -- éléments signalés par les garde-fous
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.resume_versions (user_id, created_at desc);
create trigger resume_versions_updated before update on public.resume_versions
  for each row execute function public.set_updated_at();

-- ---------- Fichiers exportés ----------
create table public.generated_files (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  resume_version_id uuid not null references public.resume_versions (id) on delete cascade,
  format            public.doc_format not null,
  storage_path      text not null,      -- bucket "exports"
  created_at        timestamptz not null default now()
);
create index on public.generated_files (user_id);

-- ---------- Lettres de motivation (Premium) ----------
create table public.cover_letters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.cover_letters (user_id);
create trigger cover_letters_updated before update on public.cover_letters
  for each row execute function public.set_updated_at();

-- ---------- Suivi des candidatures (Premium) ----------
create table public.applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  company           text not null,
  job_title         text not null,
  status            public.application_status not null default 'a_envoyer',
  job_offer_id      uuid references public.job_offers (id) on delete set null,
  resume_version_id uuid references public.resume_versions (id) on delete set null,
  cover_letter_id   uuid references public.cover_letters (id) on delete set null,
  applied_at        date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.applications (user_id);
create trigger applications_updated before update on public.applications
  for each row execute function public.set_updated_at();

-- ---------- Consommation (quotas) — écrite par le serveur ----------
create table public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.usage_kind not null,
  created_at timestamptz not null default now()
);
create index on public.usage_events (user_id, kind, created_at);

-- ---------- Journal des appels IA (coûts) — serveur et admin ----------
create table public.ai_calls (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles (id) on delete set null,
  analysis_id       uuid references public.analyses (id) on delete set null,
  step              text not null,
  model             text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd_micros   bigint not null default 0,
  duration_ms       integer,
  success           boolean not null,
  error_code        text,
  created_at        timestamptz not null default now()
);
create index on public.ai_calls (created_at);

-- =============================================================
-- RLS : isolation des données
-- =============================================================
alter table public.plans           enable row level security;
alter table public.profiles        enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.resumes         enable row level security;
alter table public.job_offers      enable row level security;
alter table public.analyses        enable row level security;
alter table public.resume_versions enable row level security;
alter table public.generated_files enable row level security;
alter table public.cover_letters   enable row level security;
alter table public.applications    enable row level security;
alter table public.usage_events    enable row level security;
alter table public.ai_calls        enable row level security;

-- Plans : lisibles par tous (page tarifs), modifiables par l'admin
create policy plans_read on public.plans for select using (true);
create policy plans_admin_write on public.plans for update
  using (public.is_admin()) with check (public.is_admin());

-- Profil : chacun le sien
create policy profiles_own_read on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_own_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Lecture seule pour l'utilisateur (écritures via service_role)
create policy subscriptions_own_read on public.subscriptions for select
  using (user_id = auth.uid());
create policy usage_own_read on public.usage_events for select
  using (user_id = auth.uid());
create policy ai_calls_admin_read on public.ai_calls for select
  using (public.is_admin());

-- Tables possédées : lecture / écriture / suppression de ses propres lignes
do $$
declare t text;
begin
  foreach t in array array[
    'resumes', 'job_offers', 'analyses', 'resume_versions',
    'generated_files', 'cover_letters', 'applications'
  ] loop
    execute format(
      'create policy %1$s_own_all on public.%1$s for all
         using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;

-- =============================================================
-- Stockage : buckets privés, un dossier par utilisateur
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cvs', 'cvs', false, 5242880, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('exports', 'exports', false, 5242880, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

create policy storage_own_read on storage.objects for select
  using (bucket_id in ('cvs', 'exports')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_own_insert on storage.objects for insert
  with check (bucket_id in ('cvs', 'exports')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_own_delete on storage.objects for delete
  using (bucket_id in ('cvs', 'exports')
         and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================
-- Quotas : consommation sur la période en cours
-- =============================================================
create or replace function public.current_tier(p_user uuid)
returns public.plan_tier language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.tier from public.subscriptions s
      where s.user_id = p_user and s.status in ('active', 'trialing')
      order by s.current_period_end desc nulls last limit 1),
    'free'::public.plan_tier);
$$;

create or replace function public.usage_count(p_user uuid, p_kind public.usage_kind)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.usage_events u
  join public.plans p on p.tier = public.current_tier(p_user)
  where u.user_id = p_user and u.kind = p_kind
    and (p.quota_period = 'lifetime' or u.created_at >= date_trunc('month', now()));
$$;
