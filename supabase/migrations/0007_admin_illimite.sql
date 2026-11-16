-- Comptes administrateurs (fondateur) : adaptations illimitées.
-- Chaque adaptation reste enregistrée dans usage_events (suivi des coûts), mais le quota ne
-- s'applique pas. Le rôle admin ne peut être donné que depuis la base (un utilisateur ne peut
-- pas se l'attribuer : voir protect_profile_fields).

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
  -- Administrateur : pas de limite (999 = illimité pour l'application)
  if exists (select 1 from public.profiles where id = uid and role = 'admin') then
    insert into public.usage_events (user_id, kind) values (uid, 'analysis');
    return 999;
  end if;
  select analyses_quota into quota from public.plans where tier = 'free';
  quota := coalesce(quota, 5);
  select count(*) into used from public.usage_events
    where user_id = uid and kind = 'analysis' and created_at >= date_trunc('month', now());
  if used >= quota then
    return -1;
  end if;
  insert into public.usage_events (user_id, kind) values (uid, 'analysis');
  return quota - used - 1;
end;
$$;
revoke execute on function public.claim_analysis() from public, anon;
grant execute on function public.claim_analysis() to authenticated;
