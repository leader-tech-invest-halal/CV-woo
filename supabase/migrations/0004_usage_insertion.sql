-- Le serveur enregistre chaque analyse avec la session de l'utilisateur connecté,
-- pour compter son quota mensuel (bêta : 5 analyses / mois).
-- Un utilisateur ne peut ajouter des lignes que pour lui-même ; il ne peut ni les modifier
-- ni les supprimer (aucune politique UPDATE / DELETE), donc il ne peut pas réduire son compteur.
create policy usage_own_insert on public.usage_events
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
