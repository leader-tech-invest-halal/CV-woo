-- Bêta gratuite : 5 analyses et 5 générations par mois, tous les modèles, export PDF et DOCX
update public.plans
set quota_period = 'month',
    analyses_quota = 5,
    generations_quota = 5,
    templates = '{professionnel,moderne,minimaliste,etudiant}',
    docx_export = true,
    history = true
where tier = 'free';
