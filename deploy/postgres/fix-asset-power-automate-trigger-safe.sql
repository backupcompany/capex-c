-- Asset INSERT → Power Automate (production webhook) via pg_net when available.
-- Siloam without pg_net: this trigger no-ops. Canonical sender = Nest
-- (POWER_AUTOMATE_ASSET_WEBHOOK_URL after persistAssetRow INSERT).
--
-- Apply (VM):
--   docker exec -i capex-postgres psql -U capex_app -d capex -v ON_ERROR_STOP=1 \
--     < deploy/postgres/fix-asset-power-automate-trigger-safe.sql

-- Best-effort only — do NOT fail the whole script if extension missing.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net not available — webhook will no-op until extension + outbound HTTPS exist';
END
$$;

-- Required so CREATE FUNCTION succeeds even when schema net is absent.
SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.send_asset_to_power_automate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_project public.projects%ROWTYPE;
    v_unit public.hospital_units_config%ROWTYPE;
    v_archetype public.archetypes_config%ROWTYPE;
BEGIN
    IF to_regnamespace('net') IS NULL THEN
        RETURN NEW;
    END IF;

    BEGIN
    SELECT * INTO v_project FROM public.projects WHERE id = NEW.project_id;
    SELECT * INTO v_unit FROM public.hospital_units_config WHERE id = v_project.hospital_unit_id;
    SELECT * INTO v_archetype FROM public.archetypes_config WHERE id = v_unit.archetype_id;

    PERFORM net.http_post(
        url := 'https://d36d9890044be130bf543e9c53c092.82.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/10/workflows/8e1e33d2b95a4f53b92fc8dbcf5a803d/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=2w3JQvU2OhvN2yloGIutCBWOFT9xmkgybwI3LSjYKRQ',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
            'asset_code', NEW.asset_code,
            'asset_name', NEW.asset_name,
            'project_code', v_project.project_code,
            'project_name', v_project.project_name,
            'unit_code', v_unit.code,
            'unit_number', v_unit.hu_number,
            'archetype_name', v_archetype.name,
            'period_name', v_project.period_name
        )
    );

    EXCEPTION
        WHEN OTHERS THEN
            NULL; -- never block asset insert if webhook fails
    END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_asset ON public.assets;
DROP TRIGGER IF EXISTS trigger_send_asset_to_power_automate ON public.assets;

CREATE TRIGGER trigger_send_asset_to_power_automate
AFTER INSERT ON public.assets
FOR EACH ROW
EXECUTE FUNCTION public.send_asset_to_power_automate();
