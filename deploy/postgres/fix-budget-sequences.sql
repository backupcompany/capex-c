-- Repair serial sequences after pg_restore (fixes intermittent INSERT failures
-- when sequence lags behind MAX(id)). Safe to re-run on VPS / Siloam VM.

SELECT setval(
  pg_get_serial_sequence('public.budget_period_category_budgets', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.budget_period_category_budgets))
);

SELECT setval(
  pg_get_serial_sequence('public.budget_period_archetype_budgets', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.budget_period_archetype_budgets))
);

SELECT setval(
  pg_get_serial_sequence('public.budget_period_hospital_unit_budgets', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.budget_period_hospital_unit_budgets))
);

SELECT setval(
  pg_get_serial_sequence('public.project_category_budgets', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.project_category_budgets))
);

SELECT setval(
  pg_get_serial_sequence('public.project_pipeline_items', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.project_pipeline_items))
);

SELECT setval(
  pg_get_serial_sequence('public.purchase_order_items', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.purchase_order_items))
);
