-- Nouveau modèle de CV « precis » : autorisé dans l'historique (simple élargissement de la liste).
alter table public.cv_history drop constraint if exists cv_history_template_check;
alter table public.cv_history add constraint cv_history_template_check
  check (template in ('original', 'encre', 'precis', 'classique', 'moderne', 'minimaliste'));
