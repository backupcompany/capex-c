-- Seed Budget HU master lookups (category + priority).
-- Fixes empty dropdown / CAT- labels / save 400 FK when these tables are empty after partial restore.
-- Safe to re-run (ON CONFLICT DO UPDATE).

BEGIN;

INSERT INTO budget_category_configs (id, name, is_active) VALUES
  ('cat-hidden-sample', 'Legacy R&D', false),
  ('cat-it-main', 'IT Maintenance', true),
  ('cat-new-rev-gen', 'New Revenue Generating', true),
  ('cat-rev-main', 'Revenue Maintenance', true),
  ('cat-strat-pipe', 'Strategic/Pipeline', true),
  ('cat-trans-it', 'Transformation & IT Strategic', true)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO project_priority_configs (id, name, is_active) VALUES
  ('prio-closed-1776157296309', 'Closed', true),
  ('prio-exclude-1776157321968', 'Exclude', true),
  ('prio-good-to-have', 'Good to Have', true),
  ('prio-high-priority-1776157154757', 'High Priority', true),
  ('prio-important-1776157221768', 'Important', true),
  ('prio-must-have', 'Must Have', true),
  ('prio-optional', 'Optional', true),
  ('prio-regular-1776157244004', 'Regular', true),
  ('prio-temukan-item', 'Temukan item', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;

-- Verify
SELECT 'budget_category_configs' AS t, count(*) FROM budget_category_configs
UNION ALL
SELECT 'project_priority_configs', count(*) FROM project_priority_configs;
