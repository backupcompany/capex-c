-- Demo super-admin for VPS Postgres (schema-only DB). Idempotent.
-- Login: demo@capex.local / demo123 (override via DEMO_LOGIN_* env)
-- Run grants as platform_admin if needed (see seed-vps-grants.sql).

INSERT INTO roles (role_name)
VALUES ('Super Admin')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO users (username, email, auth_id)
VALUES ('demo', 'demo@capex.local', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (email) DO UPDATE
  SET username = EXCLUDED.username,
      auth_id = COALESCE(users.auth_id, EXCLUDED.auth_id);

INSERT INTO user_assignments (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'demo@capex.local'
  AND r.role_name = 'Super Admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_assignment_scopes (user_assignment_id, scope_type, scope_id)
SELECT ua.id, 'All', 'All'
FROM user_assignments ua
JOIN users u ON u.id = ua.user_id
WHERE u.email = 'demo@capex.local'
  AND NOT EXISTS (
    SELECT 1 FROM user_assignment_scopes s
    WHERE s.user_assignment_id = ua.id AND s.scope_type = 'All'
  );
