-- Dummy SSO users for DEV/handoff (idempotent).
-- Ensures: wahyu, aldryan, pentest.1, pentest.2 as Super Admin + scope All.

INSERT INTO roles (role_name)
VALUES ('Super Admin')
ON CONFLICT (role_name) DO NOTHING;

-- Fix serial if lagging (avoids users_pkey / user_assignments_pkey collision).
SELECT setval(
  pg_get_serial_sequence('public.users', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.users))
);
SELECT setval(
  pg_get_serial_sequence('public.user_assignments', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.user_assignments))
);
SELECT setval(
  pg_get_serial_sequence('public.user_assignment_scopes', 'id'),
  GREATEST(1, (SELECT COALESCE(MAX(id), 1) FROM public.user_assignment_scopes))
);

INSERT INTO users (username, email)
VALUES
  ('wahyu', 'wahyu.pratama760001@siloamhospitals.com'),
  ('aldryan', 'aldryan@siloamhospitals.com'),
  ('pentest.1', 'pentest.1@siloamhospitals.com'),
  ('pentest.2', 'pentest.2@siloamhospitals.com')
ON CONFLICT (email) DO UPDATE
  SET username = EXCLUDED.username;

-- If username taken by another email, keep existing row (email wins above).
INSERT INTO users (username, email)
VALUES
  ('wahyu', 'wahyu.pratama760001@siloamhospitals.com'),
  ('aldryan', 'aldryan@siloamhospitals.com'),
  ('pentest.1', 'pentest.1@siloamhospitals.com'),
  ('pentest.2', 'pentest.2@siloamhospitals.com')
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_assignments (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.email IN (
  'wahyu.pratama760001@siloamhospitals.com',
  'aldryan@siloamhospitals.com',
  'pentest.1@siloamhospitals.com',
  'pentest.2@siloamhospitals.com'
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
  'pentest.1@siloamhospitals.com',
  'pentest.2@siloamhospitals.com'
)
AND r.role_name = 'Super Admin'
AND NOT EXISTS (
  SELECT 1 FROM user_assignment_scopes s
  WHERE s.user_assignment_id = ua.id
    AND s.scope_type = 'All'
    AND s.scope_id = 'All'
);
