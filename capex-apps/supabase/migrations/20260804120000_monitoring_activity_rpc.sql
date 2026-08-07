-- User Monitoring: aggregate last-activity per user in DB (replaces full-table scans in Node).

CREATE INDEX IF NOT EXISTS idx_task_logs_completed_by_user_at
  ON public.task_logs (completed_by_user_id, completed_at DESC)
  WHERE completed_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adhoc_tasks_created_by_user_at
  ON public.adhoc_tasks (created_by_user_id, created_at DESC)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_last_active
  ON public.auth_sessions (user_id, last_active_at DESC)
  WHERE revoked_at IS NULL AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_audit_logs_user_created
  ON public.login_audit_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL AND COALESCE(success, true);

CREATE OR REPLACE FUNCTION public.monitoring_user_activity_snapshot()
RETURNS TABLE (
  user_id bigint,
  last_task_at timestamptz,
  last_adhoc_at timestamptz,
  last_session_at timestamptz,
  last_login_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tasks AS (
    SELECT completed_by_user_id AS uid, MAX(completed_at) AS ts
    FROM task_logs
    WHERE completed_by_user_id IS NOT NULL
    GROUP BY completed_by_user_id
  ),
  adhoc AS (
    SELECT created_by_user_id AS uid, MAX(created_at) AS ts
    FROM adhoc_tasks
    WHERE created_by_user_id IS NOT NULL
    GROUP BY created_by_user_id
  ),
  sessions AS (
    SELECT s.user_id AS uid, MAX(s.last_active_at) AS ts
    FROM auth_sessions s
    WHERE s.revoked_at IS NULL AND s.user_id IS NOT NULL
    GROUP BY s.user_id
  ),
  logins AS (
    SELECT l.user_id AS uid, MAX(l.created_at) AS ts
    FROM login_audit_logs l
    WHERE l.user_id IS NOT NULL AND COALESCE(l.success, true)
    GROUP BY l.user_id
  ),
  uids AS (
    SELECT uid FROM tasks
    UNION
    SELECT uid FROM adhoc
    UNION
    SELECT uid FROM sessions
    UNION
    SELECT uid FROM logins
  )
  SELECT
    uids.uid AS user_id,
    tasks.ts AS last_task_at,
    adhoc.ts AS last_adhoc_at,
    sessions.ts AS last_session_at,
    logins.ts AS last_login_at
  FROM uids
  LEFT JOIN tasks ON tasks.uid = uids.uid
  LEFT JOIN adhoc ON adhoc.uid = uids.uid
  LEFT JOIN sessions ON sessions.uid = uids.uid
  LEFT JOIN logins ON logins.uid = uids.uid;
$$;

REVOKE ALL ON FUNCTION public.monitoring_user_activity_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitoring_user_activity_snapshot() TO service_role;
