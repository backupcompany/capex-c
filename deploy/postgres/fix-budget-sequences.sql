-- Repair serial sequences after pg_restore (fixes intermittent INSERT failures
-- on budget_period_category_budgets when sequence lags behind MAX(id)).
-- Safe to re-run on VPS / Siloam VM.

SELECT setval(
  pg_get_serial_sequence('public.budget_period_category_budgets', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.budget_period_category_budgets))
);
