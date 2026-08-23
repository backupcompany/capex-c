-- Capex Supabase — verify row counts (read-only)
-- Run in Supabase SQL Editor on project abbgvfuanefrnxtttllo
-- Expected (dump hybrid 2026-08-23):

SELECT t, n
FROM (
  SELECT 'projects' AS t, count(*)::bigint AS n FROM public.projects
  UNION ALL SELECT 'assets', count(*) FROM public.assets
  UNION ALL SELECT 'users', count(*) FROM public.users
  UNION ALL SELECT 'asset_task_statuses', count(*) FROM public.asset_task_statuses
  UNION ALL SELECT 'budget_category_configs', count(*) FROM public.budget_category_configs
  UNION ALL SELECT 'project_priority_configs', count(*) FROM public.project_priority_configs
  UNION ALL SELECT 'tasks', count(*) FROM public.tasks
  UNION ALL SELECT 'task_logs', count(*) FROM public.task_logs
  UNION ALL SELECT 'user_assignments', count(*) FROM public.user_assignments
) s
ORDER BY t;

-- Expected stamp:
-- projects                  = 4016
-- assets                    = 6917
-- users                     = 209
-- asset_task_statuses       = 128307
-- budget_category_configs   = 6
-- project_priority_configs  = 9
-- tasks                     = 96
-- task_logs                 = 11732
-- user_assignments          = 197
