-- Make assets INSERT safe without pg_net (schema "net").
-- Fixes: saveAsset: schema "net" does not exist
--
-- On Siloam VM (no pg_net):
--   docker exec -i <pg> psql -U <user> -d capex -v ON_ERROR_STOP=1 \
--     < deploy/postgres/fix-asset-power-automate-trigger-safe.sql

SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.send_asset_to_power_automate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_project public.projects%ROWTYPE;
    v_unit public.hospital_units_config%ROWTYPE;
    v_archetype public.archetypes_config%ROWTYPE;
BEGIN
    -- Skip when pg_net / schema net is missing (VM clones without extension).
    IF to_regnamespace('net') IS NULL THEN
        RETURN NEW;
    END IF;

    BEGIN
    SELECT * INTO v_project FROM public.projects WHERE id = NEW.project_id;
    SELECT * INTO v_unit FROM public.hospital_units_config WHERE id = v_project.hospital_unit_id;
    SELECT * INTO v_archetype FROM public.archetypes_config WHERE id = v_unit.archetype_id;

    PERFORM net.http_post(
        url := 'https://5f437fd2e23cea2a89a48b67b2753c.81.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/29/workflows/d2ef69dfc3bb4ba191ab9f24fcd7af70/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pJyKQS0aVZObL8gUUg3gMW9F87b7106atXThE6BGnEU',
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
