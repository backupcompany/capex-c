-- Append-only audit tables — prevent UPDATE/DELETE (defense-in-depth L5).
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION capex_prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_append_only'
  ) THEN
    CREATE TRIGGER audit_logs_append_only
      BEFORE UPDATE OR DELETE ON public.audit_logs
      FOR EACH ROW EXECUTE FUNCTION capex_prevent_audit_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'login_audit_logs_append_only'
  ) THEN
    CREATE TRIGGER login_audit_logs_append_only
      BEFORE UPDATE OR DELETE ON public.login_audit_logs
      FOR EACH ROW EXECUTE FUNCTION capex_prevent_audit_mutation();
  END IF;
END $$;
