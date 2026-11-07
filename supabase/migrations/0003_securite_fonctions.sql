-- Fige le search_path des fonctions déclencheurs
alter function public.set_updated_at() set search_path = '';
alter function public.protect_profile_fields() set search_path = '';

-- Fonctions réservées au serveur (service_role) : non appelables via l'API publique
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_tier(uuid) from public, anon, authenticated;
revoke execute on function public.usage_count(uuid, public.usage_kind) from public, anon, authenticated;
grant execute on function public.current_tier(uuid) to service_role;
grant execute on function public.usage_count(uuid, public.usage_kind) to service_role;

-- is_admin() reste appelable : utilisée par les règles RLS, elle indique seulement
-- si l'utilisateur connecté est admin (aucune donnée exposée).
