-- Droit à l'effacement (RGPD) : une personne connectée peut supprimer son propre compte.
-- La suppression dans auth.users efface en cascade le profil, le compteur d'usage et les
-- autres données liées (clés étrangères « on delete cascade »).
--
-- SECURITY DEFINER est nécessaire car un utilisateur n'a pas le droit d'écrire dans auth.users.
-- Garde-fous : la fonction ne supprime QUE la ligne de auth.uid() (jamais un autre compte),
-- refuse un appel sans session, et n'est exécutable que par le rôle authenticated.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
