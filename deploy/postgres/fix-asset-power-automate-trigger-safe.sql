-- LEGACY FILENAME — Nest is canonical (POWER_AUTOMATE_ASSET_WEBHOOK_URL).
-- This file now DISABLES the DB trigger (same as disable-asset-power-automate-db-trigger.sql).
-- DEV webhook vs PROD = env on capex-api only.

-- Disable DB-side Power Automate (Nest is canonical via POWER_AUTOMATE_ASSET_WEBHOOK_URL).
-- Safe / idempotent. Does NOT drop pg_net extension (may be used elsewhere).
--
-- Apply:
--   docker exec -i postgres-core psql -U platform_admin -d capex -v ON_ERROR_STOP=1 < this file
--   # or Siloam:
--   docker exec -i capex-postgres psql -U capex_app -d capex -v ON_ERROR_STOP=1 < this file

DROP TRIGGER IF EXISTS trigger_send_asset ON public.assets;
DROP TRIGGER IF EXISTS trigger_send_asset_to_power_automate ON public.assets;

CREATE OR REPLACE FUNCTION public.send_asset_to_power_automate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN NEW;
END;
$$;
