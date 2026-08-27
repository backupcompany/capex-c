-- Dummy SSO users for DEV/handoff (idempotent).
-- wahyu, aldryan, pentest.1 → Super Admin + All
-- pentest.2 → PMO + All

INSERT INTO roles (role_name)
VALUES ('Super Admin'), ('PMO')
ON CONFLICT (role_name) DO NOTHING;

-- Fix serial if lagging (needs sequence owner / superuser; skip on capex_app).
DO $$
BEGIN
  PERFORM setval(pg_get_serial_sequence('public.users', 'id'),
    GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.users)));
  PERFORM setval(pg_get_serial_sequence('public.user_assignments', 'id'),
    GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.user_assignments)));
  PERFORM setval(pg_get_serial_sequence('public.user_assignment_scopes', 'id'),
    GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.user_assignment_scopes)));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'setval skipped (no sequence privilege)';
END $$;

INSERT INTO users (username, email)
VALUES
  ('wahyu', 'wahyu.pratama760001@siloamhospitals.com'),
  ('aldryan', 'aldryan@siloamhospitals.com'),
  ('pentest.1', 'pentest.1@siloamhospitals.com'),
  ('pentest.2', 'pentest.2@siloamhospitals.com')
ON CONFLICT (email) DO UPDATE
  SET username = EXCLUDED.username;

INSERT INTO users (username, email)
VALUES
  ('wahyu', 'wahyu.pratama760001@siloamhospitals.com'),
  ('aldryan', 'aldryan@siloamhospitals.com'),
  ('pentest.1', 'pentest.1@siloamhospitals.com'),
  ('pentest.2', 'pentest.2@siloamhospitals.com')
ON CONFLICT (username) DO NOTHING;

-- Super Admin cohort
INSERT INTO user_assignments (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.email IN (
  'wahyu.pratama760001@siloamhospitals.com',
  'aldryan@siloamhospitals.com',
  'pentest.1@siloamhospitals.com'
)
AND r.role_name = 'Super Admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_assignment_scopes (user_assignment_id, scope_type, scope_id)
SELECT ua.id, 'All', 'All'
FROM user_assignments ua
JOIN users u ON u.id = ua.user_id
JOIN roles r ON r.id = ua.role_id
WHERE u.email IN (
  'wahyu.pratama760001@siloamhospitals.com',
  'aldryan@siloamhospitals.com',
  'pentest.1@siloamhospitals.com'
)
AND r.role_name = 'Super Admin'
AND NOT EXISTS (
  SELECT 1 FROM user_assignment_scopes s
  WHERE s.user_assignment_id = ua.id
    AND s.scope_type = 'All'
    AND s.scope_id = 'All'
);

-- pentest.2: PMO only (drop Super Admin if previously seeded)
DELETE FROM user_assignment_scopes
WHERE user_assignment_id IN (
  SELECT ua.id
  FROM user_assignments ua
  JOIN users u ON u.id = ua.user_id
  JOIN roles r ON r.id = ua.role_id
  WHERE u.email = 'pentest.2@siloamhospitals.com'
    AND r.role_name = 'Super Admin'
);

DELETE FROM user_assignments
WHERE id IN (
  SELECT ua.id
  FROM user_assignments ua
  JOIN users u ON u.id = ua.user_id
  JOIN roles r ON r.id = ua.role_id
  WHERE u.email = 'pentest.2@siloamhospitals.com'
    AND r.role_name = 'Super Admin'
);

INSERT INTO user_assignments (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'pentest.2@siloamhospitals.com'
  AND r.role_name = 'PMO'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_assignment_scopes (user_assignment_id, scope_type, scope_id)
SELECT ua.id, 'All', 'All'
FROM user_assignments ua
JOIN users u ON u.id = ua.user_id
JOIN roles r ON r.id = ua.role_id
WHERE u.email = 'pentest.2@siloamhospitals.com'
  AND r.role_name = 'PMO'
AND NOT EXISTS (
  SELECT 1 FROM user_assignment_scopes s
  WHERE s.user_assignment_id = ua.id
    AND s.scope_type = 'All'
    AND s.scope_id = 'All'
);
