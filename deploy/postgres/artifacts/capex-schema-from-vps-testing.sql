--
-- PostgreSQL database dump
--

\restrict 6KW6Lxi1FA2bdIqGWfadSaCo6pXmtnjCIa1b3Q3O9UCAWgJRG0aDjYnZdKNMMhK

-- Dumped from database version 17.11 (Debian 17.11-1.pgdg12+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg12+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: platform_admin
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO platform_admin;

--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;


--
-- Name: EXTENSION pg_net; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_net IS 'Async HTTP';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: capex_prevent_audit_mutation(); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.capex_prevent_audit_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME;
END;
$$;


ALTER FUNCTION public.capex_prevent_audit_mutation() OWNER TO platform_admin;

--
-- Name: current_user_id(); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.current_user_id() RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    -- Get user_id from session variable set by set_current_user_id()
    RETURN COALESCE(
        current_setting('app.current_user_id', true)::INTEGER,
        NULL
    );
END;
$$;


ALTER FUNCTION public.current_user_id() OWNER TO platform_admin;

--
-- Name: executive_dashboard_kpi(text, text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.executive_dashboard_kpi(p_period_name text, p_archetype_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_period text := btrim(p_period_name);
  v_arch text := NULLIF(btrim(COALESCE(p_archetype_id, '')), '');
  v_total_budget numeric := 0;
  v_allocated numeric := 0;
  v_approved numeric := 0;
  v_consumed numeric := 0;
  v_revenue numeric := 0;
  v_util numeric := 0;
BEGIN
  IF v_period = '' THEN
    RETURN jsonb_build_object(
      'totalBudget', 0,
      'budgetAllocationToProject', 0,
      'budgetApproval', 0,
      'budgetConsumed', 0,
      'budgetRevenuePerMonth', 0,
      'utilizationPct', 0
    );
  END IF;

  IF v_arch IS NULL THEN
    SELECT
      COALESCE(SUM(budget_plan + COALESCE(budget_carry_forward, 0)), 0),
      COALESCE(SUM(budget_allocated), 0),
      COALESCE(SUM(approved_budget), 0),
      COALESCE(SUM(consumed_budget), 0)
    INTO v_total_budget, v_allocated, v_approved, v_consumed
    FROM budget_period_category_budgets
    WHERE period_name = v_period;

    SELECT COALESCE(SUM(p.budget_revenue_permonth), 0)
    INTO v_revenue
    FROM projects p
    WHERE p.period_name = v_period;
  ELSE
    SELECT
      COALESCE(SUM(p.budget_plan + COALESCE(p.budget_carry_forward, 0)), 0),
      COALESCE(SUM(p.budget_allocated), 0),
      COALESCE(SUM(p.approved_budget), 0),
      COALESCE(SUM(p.consumed_budget), 0),
      COALESCE(SUM(p.budget_revenue_permonth), 0)
    INTO v_total_budget, v_allocated, v_approved, v_consumed, v_revenue
    FROM projects p
    INNER JOIN hospital_units_config hu ON hu.id = p.hospital_unit_id
    WHERE p.period_name = v_period
      AND hu.archetype_id = v_arch;
  END IF;

  IF v_total_budget > 0 THEN
    v_util := round((v_consumed / v_total_budget) * 1000) / 10;
  END IF;

  RETURN jsonb_build_object(
    'totalBudget', v_total_budget,
    'budgetAllocationToProject', v_allocated,
    'budgetApproval', v_approved,
    'budgetConsumed', v_consumed,
    'budgetRevenuePerMonth', v_revenue,
    'utilizationPct', v_util
  );
END;
$$;


ALTER FUNCTION public.executive_dashboard_kpi(p_period_name text, p_archetype_id text) OWNER TO platform_admin;

--
-- Name: is_super_admin(integer); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.is_super_admin(user_id_param integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  return exists (
    select 1
    from public.user_assignments ua
    join public.roles r on r.id = ua.role_id
    where ua.user_id = user_id_param
      and lower(trim(r.role_name)) = 'super admin'
  );
end;
$$;


ALTER FUNCTION public.is_super_admin(user_id_param integer) OWNER TO platform_admin;

--
-- Name: monitoring_user_activity_snapshot(); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.monitoring_user_activity_snapshot() RETURNS TABLE(user_id bigint, last_task_at timestamp with time zone, last_adhoc_at timestamp with time zone, last_session_at timestamp with time zone, last_login_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.monitoring_user_activity_snapshot() OWNER TO platform_admin;

--
-- Name: reserve_next_asset_seq(text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.reserve_next_asset_seq(p_project_code text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_code text := trim(p_project_code);
  v_prefix text;
  v_db_max integer := 0;
  v_next integer;
  v_parts text[];
BEGIN
  IF v_code IS NULL OR length(v_code) = 0 THEN
    RAISE EXCEPTION 'project_code is required';
  END IF;

  v_parts := string_to_array(v_code, '.');
  -- Routine project SHLV.26.RA → asset prefix SHLV.26.00
  IF array_length(v_parts, 1) >= 3 AND upper(v_parts[3]) = 'RA' THEN
    v_prefix := v_parts[1] || '.' || v_parts[2] || '.00';
  ELSE
    v_prefix := v_code;
  END IF;

  INSERT INTO public.asset_code_sequences (project_code, last_seq)
  VALUES (v_code, 0)
  ON CONFLICT (project_code) DO NOTHING;

  SELECT COALESCE(
    MAX(
      CASE
        WHEN a.asset_code ~ ('^' || replace(v_prefix, '.', '\.') || '\.([0-9]+)$')
          THEN (regexp_match(a.asset_code, '\.([0-9]+)$'))[1]::integer
        ELSE 0
      END
    ),
    0
  )
  INTO v_db_max
  FROM public.assets a
  WHERE a.asset_code LIKE v_prefix || '.%';

  UPDATE public.asset_code_sequences s
  SET
    last_seq = GREATEST(s.last_seq, v_db_max) + 1,
    updated_at = now()
  WHERE s.project_code = v_code
  RETURNING s.last_seq INTO v_next;

  RETURN v_next;
END;
$_$;


ALTER FUNCTION public.reserve_next_asset_seq(p_project_code text) OWNER TO platform_admin;

--
-- Name: reserve_next_project_nn(text, text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.reserve_next_project_nn(p_hu_code text, p_yy text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_db_max integer := 0;
  v_next integer;
BEGIN
  IF p_hu_code IS NULL OR length(trim(p_hu_code)) = 0 OR p_yy IS NULL OR length(trim(p_yy)) = 0 THEN
    RAISE EXCEPTION 'hu_code and yy are required';
  END IF;

  INSERT INTO public.project_code_sequences (hu_code, yy, last_nn)
  VALUES (trim(p_hu_code), trim(p_yy), 0)
  ON CONFLICT (hu_code, yy) DO NOTHING;

  SELECT COALESCE(
    MAX(
      CASE
        WHEN split_part(p.project_code, '.', 3) ~ '^[0-9]+$'
          THEN split_part(p.project_code, '.', 3)::integer
        ELSE 0
      END
    ),
    0
  )
  INTO v_db_max
  FROM public.projects p
  WHERE p.project_code LIKE trim(p_hu_code) || '.' || trim(p_yy) || '.%';

  UPDATE public.project_code_sequences s
  SET
    last_nn = GREATEST(s.last_nn, v_db_max) + 1,
    updated_at = now()
  WHERE s.hu_code = trim(p_hu_code)
    AND s.yy = trim(p_yy)
  RETURNING s.last_nn INTO v_next;

  RETURN v_next;
END;
$_$;


ALTER FUNCTION public.reserve_next_project_nn(p_hu_code text, p_yy text) OWNER TO platform_admin;

--
-- Name: send_asset_to_power_automate(); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.send_asset_to_power_automate() RETURNS trigger
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


ALTER FUNCTION public.send_asset_to_power_automate() OWNER TO platform_admin;

--
-- Name: set_current_user_id(integer); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.set_current_user_id(user_id_param integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Use a simple, fast operation
    PERFORM set_config('app.current_user_id', user_id_param::TEXT, false);
    -- Return immediately, don't wait for anything
    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        -- Silently ignore errors to prevent blocking
        RETURN;
END;
$$;


ALTER FUNCTION public.set_current_user_id(user_id_param integer) OWNER TO platform_admin;

--
-- Name: tor_claim_guest_session(text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_claim_guest_session(p_access_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_sess public.tor_interview_sessions%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'not_anonymous');
  end if;

  select * into v_sess
  from public.tor_interview_sessions s
  where s.access_code = p_access_code
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if v_sess.is_locked then
    return jsonb_build_object('ok', false, 'error', 'session_locked');
  end if;

  if v_sess.expires_at is not null and v_sess.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'session_expired');
  end if;

  insert into public.tor_guest_session_claims (auth_user_id, project_id, interview_session_id)
  values (v_uid, v_sess.project_id, v_sess.id)
  on conflict (auth_user_id) do update
    set project_id = excluded.project_id,
        interview_session_id = excluded.interview_session_id,
        claimed_at = now();

  return jsonb_build_object(
    'ok', true,
    'project_id', v_sess.project_id,
    'session_row_id', v_sess.id,
    'client_session_id', v_sess.client_session_id
  );
end;
$$;


ALTER FUNCTION public.tor_claim_guest_session(p_access_code text) OWNER TO platform_admin;

--
-- Name: tor_guest_claim_is_active(bigint); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_guest_claim_is_active(p_project_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.tor_guest_session_claims g
    join public.tor_interview_sessions s
      on s.id = g.interview_session_id
     and s.project_id = g.project_id
    where g.auth_user_id = (select auth.uid())
      and g.project_id = p_project_id
      and coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
      and s.is_locked = false
      and (s.expires_at is null or s.expires_at > now())
  );
$$;


ALTER FUNCTION public.tor_guest_claim_is_active(p_project_id bigint) OWNER TO platform_admin;

--
-- Name: tor_guest_session_matches(bigint, bigint); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_guest_session_matches(p_project_id bigint, p_session_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.tor_guest_session_claims g
    join public.tor_interview_sessions s
      on s.id = g.interview_session_id
     and s.project_id = g.project_id
    where g.auth_user_id = (select auth.uid())
      and g.project_id = p_project_id
      and g.interview_session_id = p_session_id
      and coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
      and s.is_locked = false
      and (s.expires_at is null or s.expires_at > now())
  );
$$;


ALTER FUNCTION public.tor_guest_session_matches(p_project_id bigint, p_session_id bigint) OWNER TO platform_admin;

--
-- Name: tor_handle_new_user(); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id integer;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = new.id
  limit 1;

  insert into public.tor_profiles (id, display_name, email, user_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    nullif(new.email, ''),
    v_user_id
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.tor_profiles.email),
        user_id = coalesce(excluded.user_id, public.tor_profiles.user_id),
        display_name = case
          when public.tor_profiles.display_name = '' then excluded.display_name
          else public.tor_profiles.display_name
        end,
        updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION public.tor_handle_new_user() OWNER TO platform_admin;

--
-- Name: tor_profile_job_roles_enforce_job_kind(); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_profile_job_roles_enforce_job_kind() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.tor_roles r
    where r.id = new.job_role_id and r.role_kind = 'job'
  ) then
    raise exception 'tor_profile_job_roles: role_id % must have role_kind = job', new.job_role_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tor_profile_job_roles_enforce_job_kind() OWNER TO platform_admin;

--
-- Name: tor_public_user_id_from_auth(); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_public_user_id_from_auth() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select u.id
  from public.users u
  where u.auth_id = (select auth.uid())
  limit 1;
$$;


ALTER FUNCTION public.tor_public_user_id_from_auth() OWNER TO platform_admin;

--
-- Name: tor_sync_project_capture_tables(bigint, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_sync_project_capture_tables(p_project_id bigint, p_uncategorized jsonb, p_conflicts jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  spec jsonb;
  cf jsonb;
  res_id uuid;
  line text;
  rid text;
  d jsonb;
  ord integer;
  emb text;
begin
  if not (
    public.tor_user_can_edit_project_requirements(p_project_id)
    or public.tor_guest_claim_is_active(p_project_id)
  ) then
    raise exception 'forbidden: cannot sync capture tables for this project';
  end if;

  delete from public.tor_uncategorized_spec_items where project_id = p_project_id;
  delete from public.tor_uncategorized_specs where project_id = p_project_id;
  delete from public.tor_conflict_interviewee_details where project_id = p_project_id;
  delete from public.tor_conflict_guideline_details where project_id = p_project_id;
  delete from public.tor_conflict_related_requirements where project_id = p_project_id;
  delete from public.tor_conflicts where project_id = p_project_id;

  for spec in select * from jsonb_array_elements(coalesce(p_uncategorized, '[]'::jsonb))
  loop
    res_id := null;
    if spec ? 'resolution' and spec->'resolution' is not null and spec->'resolution' <> 'null'::jsonb then
      insert into public.tor_resolutions (decision, resolved_by, resolved_at)
      values (
        spec->'resolution'->>'decision',
        spec->'resolution'->>'resolved_by',
        coalesce((spec->'resolution'->>'resolved_at')::timestamptz, now())
      )
      returning id into res_id;
    end if;

    insert into public.tor_uncategorized_specs (id, project_id, title, status_id, resolution_id)
    values (
      spec->>'id',
      p_project_id,
      spec->>'title',
      (spec->>'status_id')::smallint,
      res_id
    );

    ord := 0;
    for line in
      select jsonb_array_elements_text(coalesce(spec->'specifications', '[]'::jsonb))
    loop
      insert into public.tor_uncategorized_spec_items (project_id, spec_id, sort_order, specification)
      values (p_project_id, spec->>'id', ord, line);
      ord := ord + 1;
    end loop;
  end loop;

  for cf in select * from jsonb_array_elements(coalesce(p_conflicts, '[]'::jsonb))
  loop
    res_id := null;
    if cf ? 'resolution' and cf->'resolution' is not null and cf->'resolution' <> 'null'::jsonb then
      insert into public.tor_resolutions (decision, resolved_by, resolved_at)
      values (
        cf->'resolution'->>'decision',
        cf->'resolution'->>'resolved_by',
        coalesce((cf->'resolution'->>'resolved_at')::timestamptz, now())
      )
      returning id into res_id;
    end if;

    emb := cf->>'embedding';
    if emb is null or emb = '' then
      insert into public.tor_conflicts (id, project_id, subject, type_id, status_id, ai_suggestion, resolution_id, embedding)
      values (
        cf->>'id',
        p_project_id,
        cf->>'subject',
        (cf->>'type_id')::smallint,
        (cf->>'status_id')::smallint,
        coalesce(cf->>'ai_suggestion', ''),
        res_id,
        null
      );
    else
      insert into public.tor_conflicts (id, project_id, subject, type_id, status_id, ai_suggestion, resolution_id, embedding)
      values (
        cf->>'id',
        p_project_id,
        cf->>'subject',
        (cf->>'type_id')::smallint,
        (cf->>'status_id')::smallint,
        coalesce(cf->>'ai_suggestion', ''),
        res_id,
        emb::public.vector(768)
      );
    end if;

    ord := 0;
    for rid in select * from jsonb_array_elements_text(coalesce(cf->'related_requirement_ids', '[]'::jsonb))
    loop
      insert into public.tor_conflict_related_requirements (project_id, conflict_id, sort_order, requirement_id)
      values (p_project_id, cf->>'id', ord, rid);
      ord := ord + 1;
    end loop;

    ord := 0;
    for d in select * from jsonb_array_elements(coalesce(cf->'interviewee_details', '[]'::jsonb))
    loop
      insert into public.tor_conflict_interviewee_details (
        project_id, conflict_id, sort_order, interviewee_name, interviewee_persona, statement
      )
      values (
        p_project_id,
        cf->>'id',
        ord,
        coalesce(d->>'interviewee_name', ''),
        coalesce(d->>'interviewee_persona', ''),
        coalesce(d->>'statement', '')
      );
      ord := ord + 1;
    end loop;

    if cf ? 'guideline_detail' and cf->'guideline_detail' is not null and cf->'guideline_detail' <> 'null'::jsonb then
      d := cf->'guideline_detail';
      insert into public.tor_conflict_guideline_details (
        project_id, conflict_id, interviewee_name, interviewee_persona, statement,
        context_name, source_type, rule_type, rule_text
      )
      values (
        p_project_id,
        cf->>'id',
        coalesce(d->>'interviewee_name', ''),
        coalesce(d->>'interviewee_persona', ''),
        coalesce(d->>'statement', ''),
        coalesce(d->>'context_name', ''),
        coalesce(d->>'source_type', ''),
        coalesce(d->>'rule_type', ''),
        coalesce(d->>'rule_text', '')
      );
    end if;
  end loop;
end;
$$;


ALTER FUNCTION public.tor_sync_project_capture_tables(p_project_id bigint, p_uncategorized jsonb, p_conflicts jsonb) OWNER TO platform_admin;

--
-- Name: tor_user_can_access_project(bigint); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_user_can_access_project(p_project_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.tor_user_sees_all_projects()
    or exists (
      select 1
      from public.tor_projects p
      join public.tor_profile_hospitals ph
        on ph.profile_id = (select auth.uid())
       and ph.hospital_id = p.hospital_id
      where p.id = p_project_id
    );
$$;


ALTER FUNCTION public.tor_user_can_access_project(p_project_id bigint) OWNER TO platform_admin;

--
-- Name: tor_user_can_edit_project_requirements(bigint); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_user_can_edit_project_requirements(p_project_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select (
    public.tor_user_has_permission('manageProjects')
    or public.tor_user_has_permission('captureProjectRequirements')
  )
    and public.tor_user_can_access_project(p_project_id);
$$;


ALTER FUNCTION public.tor_user_can_edit_project_requirements(p_project_id bigint) OWNER TO platform_admin;

--
-- Name: tor_user_can_read_project(bigint); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_user_can_read_project(p_project_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    exists (
      select 1
      from public.tor_guest_session_claims g
      where g.auth_user_id = (select auth.uid())
        and g.project_id = p_project_id
        and coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
    )
    or (
      public.tor_user_has_permission('viewDashboard')
      and public.tor_user_can_access_project(p_project_id)
    );
$$;


ALTER FUNCTION public.tor_user_can_read_project(p_project_id bigint) OWNER TO platform_admin;

--
-- Name: tor_user_can_write_project(bigint); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_user_can_write_project(p_project_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.tor_user_has_permission('manageProjects')
    and public.tor_user_can_access_project(p_project_id);
$$;


ALTER FUNCTION public.tor_user_can_write_project(p_project_id bigint) OWNER TO platform_admin;

--
-- Name: tor_user_has_permission(text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_user_has_permission(p_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.tor_profiles tp
    where tp.id = (select auth.uid())
      and (
        exists (
          select 1
          from public.tor_role_permissions rp
          join public.tor_permissions p on p.id = rp.permission_id
          where rp.role_id = tp.system_role_id
            and p.code = p_code
        )
        or exists (
          select 1
          from public.tor_profile_job_roles pjr
          join public.tor_role_permissions rp on rp.role_id = pjr.job_role_id
          join public.tor_permissions p on p.id = rp.permission_id
          where pjr.profile_id = tp.id
            and p.code = p_code
        )
      )
  );
$$;


ALTER FUNCTION public.tor_user_has_permission(p_code text) OWNER TO platform_admin;

--
-- Name: tor_user_sees_all_projects(); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.tor_user_sees_all_projects() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not exists (
    select 1
    from public.tor_profile_hospitals ph
    where ph.profile_id = (select auth.uid())
  );
$$;


ALTER FUNCTION public.tor_user_sees_all_projects() OWNER TO platform_admin;

--
-- Name: user_accessible_archetype_ids(integer); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_accessible_archetype_ids(user_id_param integer) RETURNS SETOF character varying
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- If user has "All" scope, return all archetypes
    IF user_has_all_scope(user_id_param) THEN
        RETURN QUERY SELECT id FROM archetypes_config;
    ELSE
        -- Return specific archetype IDs from scopes
        RETURN QUERY
        SELECT DISTINCT uas.scope_id
        FROM user_assignments ua
        JOIN user_assignment_scopes uas ON ua.id = uas.user_assignment_id
        WHERE ua.user_id = user_id_param
        AND uas.scope_type = 'Archetype';
    END IF;
END;
$$;


ALTER FUNCTION public.user_accessible_archetype_ids(user_id_param integer) OWNER TO platform_admin;

--
-- Name: user_accessible_hu_ids(integer); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_accessible_hu_ids(user_id_param integer) RETURNS SETOF character varying
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- If user has "All" scope, return all hospital units
    IF user_has_all_scope(user_id_param) THEN
        RETURN QUERY SELECT id FROM hospital_units_config;
    ELSE
        -- Return specific HU IDs from scopes, plus HUs from accessible archetypes
        RETURN QUERY
        SELECT DISTINCT hu.id
        FROM hospital_units_config hu
        WHERE (
            -- Direct HU scope access
            EXISTS (
                SELECT 1
                FROM user_assignments ua
                JOIN user_assignment_scopes uas ON ua.id = uas.user_assignment_id
                WHERE ua.user_id = user_id_param
                AND uas.scope_type = 'HospitalUnit'
                AND uas.scope_id = hu.id
            )
            OR
            -- Archetype scope access (implicitly includes all HUs in that archetype)
            EXISTS (
                SELECT 1
                FROM user_assignments ua
                JOIN user_assignment_scopes uas ON ua.id = uas.user_assignment_id
                WHERE ua.user_id = user_id_param
                AND uas.scope_type = 'Archetype'
                AND uas.scope_id = hu.archetype_id
            )
        );
    END IF;
END;
$$;


ALTER FUNCTION public.user_accessible_hu_ids(user_id_param integer) OWNER TO platform_admin;

--
-- Name: user_can_create_hierarchy(integer, text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_can_create_hierarchy(p_user_id integer, p_hierarchy text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN user_has_permission_for_hierarchy(p_user_id, p_hierarchy, 'View, Update & Create');
END;
$$;


ALTER FUNCTION public.user_can_create_hierarchy(p_user_id integer, p_hierarchy text) OWNER TO platform_admin;

--
-- Name: user_can_delete_hierarchy(integer, text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_can_delete_hierarchy(p_user_id integer, p_hierarchy text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN user_has_permission_for_hierarchy(p_user_id, p_hierarchy, 'View, Update, Create & Delete');
END;
$$;


ALTER FUNCTION public.user_can_delete_hierarchy(p_user_id integer, p_hierarchy text) OWNER TO platform_admin;

--
-- Name: user_can_see_all_hu_scope(integer); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_can_see_all_hu_scope(p_user_id integer) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.user_has_all_scope(p_user_id) OR public.is_super_admin(p_user_id);
$$;


ALTER FUNCTION public.user_can_see_all_hu_scope(p_user_id integer) OWNER TO platform_admin;

--
-- Name: FUNCTION user_can_see_all_hu_scope(p_user_id integer); Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON FUNCTION public.user_can_see_all_hu_scope(p_user_id integer) IS 'True jika user boleh melihat semua HU (scope All ATAU role Super Admin). Dipakai RLS assets/projects.';


--
-- Name: user_can_update_hierarchy(integer, text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_can_update_hierarchy(p_user_id integer, p_hierarchy text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN user_has_permission_for_hierarchy(p_user_id, p_hierarchy, 'View & Update');
END;
$$;


ALTER FUNCTION public.user_can_update_hierarchy(p_user_id integer, p_hierarchy text) OWNER TO platform_admin;

--
-- Name: user_can_view_hierarchy(integer, text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_can_view_hierarchy(p_user_id integer, p_hierarchy text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN user_has_permission_for_hierarchy(p_user_id, p_hierarchy, 'View Only');
END;
$$;


ALTER FUNCTION public.user_can_view_hierarchy(p_user_id integer, p_hierarchy text) OWNER TO platform_admin;

--
-- Name: user_has_all_scope(integer); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_has_all_scope(user_id_param integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if public.is_super_admin(user_id_param) then
    return true;
  end if;

  return exists (
    select 1
    from public.user_assignments ua
    join public.user_assignment_scopes uas on ua.id = uas.user_assignment_id
    where ua.user_id = user_id_param
      and uas.scope_type = 'All'
  );
end;
$$;


ALTER FUNCTION public.user_has_all_scope(user_id_param integer) OWNER TO platform_admin;

--
-- Name: user_has_permission_for_hierarchy(integer, text, text); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_has_permission_for_hierarchy(p_user_id integer, p_hierarchy text, p_required_permission text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_user_permission TEXT;
    v_permission_value INTEGER;
    v_required_value INTEGER;
BEGIN
    -- Super Admin selalu punya full access
    IF EXISTS (
        SELECT 1 FROM user_assignments ua
        JOIN roles r ON r.id = ua.role_id
        WHERE ua.user_id = p_user_id AND r.role_name = 'Super Admin'
    ) THEN
        RETURN TRUE;
    END IF;

    -- Get permission level untuk hierarchy ini dari role user
    SELECT rp.permission INTO v_user_permission
    FROM user_assignments ua
    JOIN roles r ON r.id = ua.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    WHERE ua.user_id = p_user_id
    AND rp.hierarchy = p_hierarchy
    ORDER BY 
        CASE rp.permission
            WHEN 'View, Update, Create & Delete' THEN 4
            WHEN 'View, Update & Create' THEN 3
            WHEN 'View & Update' THEN 2
            WHEN 'View Only' THEN 1
            WHEN 'Hide' THEN 0
        END DESC
    LIMIT 1;

    -- Jika tidak ada permission, return false
    IF v_user_permission IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Convert permission ke nilai numerik
    v_permission_value := CASE v_user_permission
        WHEN 'View, Update, Create & Delete' THEN 4
        WHEN 'View, Update & Create' THEN 3
        WHEN 'View & Update' THEN 2
        WHEN 'View Only' THEN 1
        WHEN 'Hide' THEN 0
    END;

    v_required_value := CASE p_required_permission
        WHEN 'View, Update, Create & Delete' THEN 4
        WHEN 'View, Update & Create' THEN 3
        WHEN 'View & Update' THEN 2
        WHEN 'View Only' THEN 1
        WHEN 'Hide' THEN 0
    END;

    -- Check apakah permission user >= required permission
    RETURN v_permission_value >= v_required_value;
END;
$$;


ALTER FUNCTION public.user_has_permission_for_hierarchy(p_user_id integer, p_hierarchy text, p_required_permission text) OWNER TO platform_admin;

--
-- Name: user_has_permission_for_hierarchy(integer, character varying, character varying); Type: FUNCTION; Schema: public; Owner: platform_admin
--

CREATE FUNCTION public.user_has_permission_for_hierarchy(user_id_param integer, hierarchy_param character varying, required_permission_param character varying) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    permission_value INTEGER;
    user_permission_value INTEGER;
BEGIN
    -- Super Admin selalu punya full access
    IF EXISTS (
        SELECT 1
        FROM user_assignments ua
        JOIN roles r ON r.id = ua.role_id
        WHERE ua.user_id = user_id_param
        AND r.role_name = 'Super Admin'
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- Check jika user punya scope "All"
    IF user_has_all_scope(user_id_param) THEN
        RETURN TRUE;
    END IF;
    
    -- Map permission string ke nilai
    permission_value := CASE required_permission_param
        WHEN 'Hide' THEN 0
        WHEN 'View Only' THEN 1
        WHEN 'View & Update' THEN 2
        WHEN 'View, Update & Create' THEN 3
        WHEN 'View, Update, Create & Delete' THEN 4
        ELSE 0
    END;
    
    -- Get user's permission untuk hierarchy ini
    SELECT COALESCE(MAX(
        CASE rp.permission
            WHEN 'Hide' THEN 0
            WHEN 'View Only' THEN 1
            WHEN 'View & Update' THEN 2
            WHEN 'View, Update & Create' THEN 3
            WHEN 'View, Update, Create & Delete' THEN 4
            ELSE 0
        END
    ), 0)
    INTO user_permission_value
    FROM user_assignments ua
    JOIN role_permissions rp ON rp.role_id = ua.role_id
    WHERE ua.user_id = user_id_param
    AND rp.hierarchy = hierarchy_param;
    
    -- User punya permission jika user_permission_value >= required permission_value
    RETURN user_permission_value >= permission_value;
END;
$$;


ALTER FUNCTION public.user_has_permission_for_hierarchy(user_id_param integer, hierarchy_param character varying, required_permission_param character varying) OWNER TO platform_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: adhoc_tasks; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.adhoc_tasks (
    id character varying(255) NOT NULL,
    asset_id character varying(255) NOT NULL,
    description text NOT NULL,
    assigned_to_user_id integer NOT NULL,
    assigned_to_username character varying(255) NOT NULL,
    due_date date NOT NULL,
    status character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id integer NOT NULL,
    created_by_username character varying(255) NOT NULL,
    completed_at timestamp without time zone,
    completion_remark text
);


ALTER TABLE public.adhoc_tasks OWNER TO platform_admin;

--
-- Name: api_audit_logs; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.api_audit_logs (
    id bigint NOT NULL,
    user_id integer,
    method text NOT NULL,
    path text NOT NULL,
    status_code integer,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.api_audit_logs OWNER TO platform_admin;

--
-- Name: api_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.api_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.api_audit_logs_id_seq OWNER TO platform_admin;

--
-- Name: api_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.api_audit_logs_id_seq OWNED BY public.api_audit_logs.id;


--
-- Name: app_config; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.app_config (
    key character varying(255) NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.app_config OWNER TO platform_admin;

--
-- Name: archetypes_config; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.archetypes_config (
    id character varying(255) NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.archetypes_config OWNER TO platform_admin;

--
-- Name: asset_code_sequences; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.asset_code_sequences (
    project_code text NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.asset_code_sequences OWNER TO platform_admin;

--
-- Name: TABLE asset_code_sequences; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.asset_code_sequences IS 'Monotonic next asset sequence per project_code prefix; reserve_next_asset_seq bumps under row lock.';


--
-- Name: asset_tags; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.asset_tags (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.asset_tags OWNER TO platform_admin;

--
-- Name: asset_task_statuses; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.asset_task_statuses (
    id character varying(255) NOT NULL,
    asset_id character varying(255) NOT NULL,
    task_id character varying(255) NOT NULL,
    status character varying(50) NOT NULL,
    start_date date,
    target_end_date date,
    completed_at timestamp without time zone,
    log_id character varying(255),
    reported_not_yet_by_user_id integer,
    reported_not_yet_by_username character varying(255),
    rescheduled_end_date date,
    reschedule_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sla_to_complete_override integer
);


ALTER TABLE public.asset_task_statuses OWNER TO platform_admin;

--
-- Name: COLUMN asset_task_statuses.sla_to_complete_override; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.asset_task_statuses.sla_to_complete_override IS 'Optional SLA days for this asset+task; overrides workflow step default without changing global config.';


--
-- Name: asset_type_configs; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.asset_type_configs (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    workflow_set_id character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    group_id character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.asset_type_configs OWNER TO platform_admin;

--
-- Name: asset_type_groups; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.asset_type_groups (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.asset_type_groups OWNER TO platform_admin;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.assets (
    id character varying(255) NOT NULL,
    asset_code character varying(100) NOT NULL,
    asset_name character varying(255) NOT NULL,
    description text,
    project_id character varying(255) NOT NULL,
    budget_plan numeric(15,2) DEFAULT 0,
    budget_allocated numeric(15,2) DEFAULT 0,
    consumed_budget numeric(15,2) DEFAULT 0,
    workflow_set_id character varying(255) NOT NULL,
    budget_category_id character varying(255) NOT NULL,
    end_target_date date,
    catalogue_id character varying(255),
    po_number character varying(100),
    is_goods_received boolean DEFAULT false,
    bdd_priority character varying(100),
    asset_type_id character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    qty integer DEFAULT 1,
    received_qty integer DEFAULT 0,
    lifecycle_status text,
    cpr_id text,
    po_date date
);


ALTER TABLE public.assets OWNER TO platform_admin;

--
-- Name: COLUMN assets.qty; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.assets.qty IS 'Quantity of assets (default: 1)';


--
-- Name: COLUMN assets.received_qty; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.assets.received_qty IS 'Quantity of assets that have been received (default: 0)';


--
-- Name: COLUMN assets.cpr_id; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.assets.cpr_id IS 'Capex Purchase Request identifier (PO Update screen)';


--
-- Name: COLUMN assets.po_date; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.assets.po_date IS 'Purchase order date';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.audit_logs (
    id character varying(255) NOT NULL,
    entity_id character varying(255) NOT NULL,
    entity_type character varying(50) NOT NULL,
    action character varying(50) NOT NULL,
    field_name character varying(255),
    old_value text,
    new_value text,
    changed_by character varying(255) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO platform_admin;

--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.auth_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    auth_id uuid NOT NULL,
    refresh_token_hash text NOT NULL,
    family_id uuid DEFAULT gen_random_uuid() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    ip_address text,
    user_agent text,
    last_active_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.auth_sessions OWNER TO platform_admin;

--
-- Name: budget_category_configs; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.budget_category_configs (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.budget_category_configs OWNER TO platform_admin;

--
-- Name: budget_multi_years; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.budget_multi_years (
    name character varying(255) NOT NULL,
    start_year integer NOT NULL,
    end_year integer NOT NULL,
    budget_plan numeric(15,2) DEFAULT 0,
    budget_carry_forward numeric(15,2) DEFAULT 0,
    budget_allocated numeric(15,2) DEFAULT 0,
    approved_budget numeric(15,2) DEFAULT 0,
    consumed_budget numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.budget_multi_years OWNER TO platform_admin;

--
-- Name: budget_period_archetype_budgets; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.budget_period_archetype_budgets (
    id integer NOT NULL,
    period_name character varying(255) NOT NULL,
    archetype_id character varying(255) NOT NULL,
    budget_category_id character varying(255) NOT NULL,
    budget_plan numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.budget_period_archetype_budgets OWNER TO platform_admin;

--
-- Name: TABLE budget_period_archetype_budgets; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.budget_period_archetype_budgets IS 'Stores manual budget plan per archetype per category per period';


--
-- Name: budget_period_archetype_budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.budget_period_archetype_budgets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.budget_period_archetype_budgets_id_seq OWNER TO platform_admin;

--
-- Name: budget_period_archetype_budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.budget_period_archetype_budgets_id_seq OWNED BY public.budget_period_archetype_budgets.id;


--
-- Name: budget_period_category_budgets; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.budget_period_category_budgets (
    id integer NOT NULL,
    period_name character varying(255) NOT NULL,
    budget_category_id character varying(255) NOT NULL,
    budget_plan numeric(15,2) DEFAULT 0,
    budget_carry_forward numeric(15,2) DEFAULT 0,
    budget_allocated numeric(15,2) DEFAULT 0,
    approved_budget numeric(15,2) DEFAULT 0,
    consumed_budget numeric(15,2) DEFAULT 0,
    asset_count integer DEFAULT 0,
    no_budget_asset_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.budget_period_category_budgets OWNER TO platform_admin;

--
-- Name: TABLE budget_period_category_budgets; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.budget_period_category_budgets IS 'Budget per category normalized from budget_periods.budget_data JSONB';


--
-- Name: budget_period_category_budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.budget_period_category_budgets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.budget_period_category_budgets_id_seq OWNER TO platform_admin;

--
-- Name: budget_period_category_budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.budget_period_category_budgets_id_seq OWNED BY public.budget_period_category_budgets.id;


--
-- Name: budget_period_hospital_unit_budgets; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.budget_period_hospital_unit_budgets (
    id integer NOT NULL,
    period_name character varying(255) NOT NULL,
    hospital_unit_id character varying(255) NOT NULL,
    budget_category_id character varying(255) NOT NULL,
    budget_plan numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.budget_period_hospital_unit_budgets OWNER TO platform_admin;

--
-- Name: TABLE budget_period_hospital_unit_budgets; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.budget_period_hospital_unit_budgets IS 'Stores manual budget plan per hospital unit per category per period';


--
-- Name: budget_period_hospital_unit_budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.budget_period_hospital_unit_budgets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.budget_period_hospital_unit_budgets_id_seq OWNER TO platform_admin;

--
-- Name: budget_period_hospital_unit_budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.budget_period_hospital_unit_budgets_id_seq OWNED BY public.budget_period_hospital_unit_budgets.id;


--
-- Name: budget_periods; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.budget_periods (
    period_name character varying(255) NOT NULL,
    multi_year_name character varying(255) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.budget_periods OWNER TO platform_admin;

--
-- Name: feasibility_studies; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.feasibility_studies (
    id character varying NOT NULL,
    project_id character varying NOT NULL,
    fs_type character varying NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    irr numeric DEFAULT 0 NOT NULL,
    payback_period numeric DEFAULT 0 NOT NULL,
    npv numeric DEFAULT 0 NOT NULL,
    roi numeric DEFAULT 0 NOT NULL,
    planned_revenue_start_date date NOT NULL,
    actual_revenue_start_date date,
    monthly_revenue_plan numeric DEFAULT 0 NOT NULL,
    conclusion character varying DEFAULT 'Pending'::character varying NOT NULL,
    follow_up_action text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    throughput numeric DEFAULT 0 NOT NULL
);


ALTER TABLE public.feasibility_studies OWNER TO platform_admin;

--
-- Name: fs_realizations; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.fs_realizations (
    id character varying NOT NULL,
    fs_id character varying NOT NULL,
    month character varying NOT NULL,
    actual_revenue numeric DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    actual_throughput numeric DEFAULT 0 NOT NULL
);


ALTER TABLE public.fs_realizations OWNER TO platform_admin;

--
-- Name: hospital_units_config; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.hospital_units_config (
    id character varying(255) NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    archetype_id character varying(255) NOT NULL,
    regional_id character varying(255) NOT NULL,
    hu_number character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_pipeline boolean DEFAULT false NOT NULL
);


ALTER TABLE public.hospital_units_config OWNER TO platform_admin;

--
-- Name: COLUMN hospital_units_config.is_pipeline; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.hospital_units_config.is_pipeline IS 'True when this hospital unit is designated as a Pipeline unit.';


--
-- Name: login_audit_logs; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.login_audit_logs (
    id bigint NOT NULL,
    user_id integer,
    auth_id uuid,
    email text,
    success boolean DEFAULT false NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text,
    is_suspicious boolean DEFAULT false,
    metadata jsonb
);


ALTER TABLE public.login_audit_logs OWNER TO platform_admin;

--
-- Name: COLUMN login_audit_logs.event_type; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.login_audit_logs.event_type IS 'login | login_failed | logout | token_refresh';


--
-- Name: COLUMN login_audit_logs.is_suspicious; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.login_audit_logs.is_suspicious IS 'True when IP or user-agent differs from recent successful logins';


--
-- Name: COLUMN login_audit_logs.metadata; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.login_audit_logs.metadata IS 'JSON context e.g. { "reasons": ["new_ip_address"] }';


--
-- Name: login_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.login_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.login_audit_logs_id_seq OWNER TO platform_admin;

--
-- Name: login_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.login_audit_logs_id_seq OWNED BY public.login_audit_logs.id;


--
-- Name: master_catalogue; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.master_catalogue (
    id character varying(255) NOT NULL,
    rds_code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(100),
    price numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.master_catalogue OWNER TO platform_admin;

--
-- Name: moms; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.moms (
    id character varying(255) NOT NULL,
    asset_id character varying(255) NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id integer NOT NULL,
    created_by_username character varying(255) NOT NULL
);


ALTER TABLE public.moms OWNER TO platform_admin;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.notifications (
    id character varying(255) NOT NULL,
    user_id integer NOT NULL,
    message text NOT NULL,
    type character varying(50) NOT NULL,
    is_read boolean DEFAULT false,
    link_to_page character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.notifications OWNER TO platform_admin;

--
-- Name: offline_data; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.offline_data (
    id character varying(255) NOT NULL,
    dataset_name character varying(255) NOT NULL,
    original_row jsonb NOT NULL,
    processed_row jsonb,
    status character varying(50) NOT NULL,
    uploaded_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.offline_data OWNER TO platform_admin;

--
-- Name: project_category_budgets; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.project_category_budgets (
    id integer NOT NULL,
    project_id character varying(255) NOT NULL,
    budget_category_id character varying(255) NOT NULL,
    budget_plan numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.project_category_budgets OWNER TO platform_admin;

--
-- Name: TABLE project_category_budgets; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.project_category_budgets IS 'Project budget per category normalized from projects.category_budget_plan JSONB';


--
-- Name: project_category_budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.project_category_budgets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_category_budgets_id_seq OWNER TO platform_admin;

--
-- Name: project_category_budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.project_category_budgets_id_seq OWNED BY public.project_category_budgets.id;


--
-- Name: project_code_sequences; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.project_code_sequences (
    hu_code text NOT NULL,
    yy text NOT NULL,
    last_nn integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.project_code_sequences OWNER TO platform_admin;

--
-- Name: TABLE project_code_sequences; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.project_code_sequences IS 'Monotonic next project running number per HU+YY; reserve_next_project_nn bumps under row lock.';


--
-- Name: project_pipeline_items; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.project_pipeline_items (
    id integer NOT NULL,
    project_id character varying(255) NOT NULL,
    room_id character varying(255) NOT NULL,
    catalogue_id character varying(255) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    hospital_unit_id character varying(255),
    archetype_id character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.project_pipeline_items OWNER TO platform_admin;

--
-- Name: TABLE project_pipeline_items; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.project_pipeline_items IS 'Pipeline items normalized from projects.pipeline_data JSONB';


--
-- Name: project_pipeline_items_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.project_pipeline_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.project_pipeline_items_id_seq OWNER TO platform_admin;

--
-- Name: project_pipeline_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.project_pipeline_items_id_seq OWNED BY public.project_pipeline_items.id;


--
-- Name: project_priority_configs; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.project_priority_configs (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.project_priority_configs OWNER TO platform_admin;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.projects (
    id character varying(255) NOT NULL,
    asset_code character varying(100),
    project_name character varying(255) NOT NULL,
    asset_name character varying(255),
    project_code character varying(100) NOT NULL,
    ax_code character varying(100),
    completion_rate numeric(5,2) DEFAULT 0,
    task_to_do text,
    owner character varying(255),
    target_start date,
    end_date date,
    status integer NOT NULL,
    plan character varying(50),
    budget_plan numeric(15,2) DEFAULT 0,
    budget_carry_forward numeric(15,2) DEFAULT 0,
    budget_allocated numeric(15,2) DEFAULT 0,
    approved_budget numeric(15,2) DEFAULT 0,
    consumed_budget numeric(15,2) DEFAULT 0,
    revenue_projection numeric(15,2) DEFAULT 0,
    priority_id character varying(255) NOT NULL,
    type character varying(100) NOT NULL,
    budget_category_id character varying(255) NOT NULL,
    hospital_unit_id character varying(255) NOT NULL,
    is_routine_asset_aggregator boolean DEFAULT false,
    is_pipeline_project boolean DEFAULT false,
    stage integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    target_budget_start date,
    budget_revenue_permonth numeric DEFAULT 0,
    period_name character varying(255)
);


ALTER TABLE public.projects OWNER TO platform_admin;

--
-- Name: COLUMN projects.target_budget_start; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.projects.target_budget_start IS 'Target budget start date';


--
-- Name: COLUMN projects.budget_revenue_permonth; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.projects.budget_revenue_permonth IS 'Budget revenue per month (currency)';


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.purchase_order_items (
    id integer NOT NULL,
    purchase_order_id character varying(255) NOT NULL,
    catalogue_id character varying(255) NOT NULL,
    rds_code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    price numeric(15,2) DEFAULT 0 NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    received_quantity integer DEFAULT 0 NOT NULL,
    remarks text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.purchase_order_items OWNER TO platform_admin;

--
-- Name: TABLE purchase_order_items; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.purchase_order_items IS 'PO items normalized from purchase_orders.items JSONB';


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.purchase_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.purchase_order_items_id_seq OWNER TO platform_admin;

--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.purchase_order_items_id_seq OWNED BY public.purchase_order_items.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.purchase_orders (
    id character varying(255) NOT NULL,
    po_number character varying(100) NOT NULL,
    project_id character varying(255) NOT NULL,
    stage integer DEFAULT 0,
    vendor_id character varying(255) NOT NULL,
    vendor_name character varying(255) NOT NULL,
    total_value numeric(15,2) NOT NULL,
    status character varying(50) NOT NULL,
    shipping_address text,
    remarks text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.purchase_orders OWNER TO platform_admin;

--
-- Name: regionals_config; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.regionals_config (
    id character varying(255) NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.regionals_config OWNER TO platform_admin;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.role_permissions (
    id integer NOT NULL,
    role_id integer NOT NULL,
    hierarchy character varying(100) NOT NULL,
    permission character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.role_permissions OWNER TO platform_admin;

--
-- Name: TABLE role_permissions; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.role_permissions IS 'Role permissions normalized from roles.permissions JSONB';


--
-- Name: role_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.role_permissions_id_seq OWNER TO platform_admin;

--
-- Name: role_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.role_permissions_id_seq OWNED BY public.role_permissions.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    role_name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.roles OWNER TO platform_admin;

--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_seq OWNER TO platform_admin;

--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: rooms_config; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.rooms_config (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.rooms_config OWNER TO platform_admin;

--
-- Name: task_logs; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.task_logs (
    id character varying(255) NOT NULL,
    asset_id character varying(255) NOT NULL,
    task_id character varying(255) NOT NULL,
    remark text,
    completed_at timestamp without time zone NOT NULL,
    completed_by_user_id integer,
    completed_by_username character varying(255),
    completed_by_user_role character varying(255),
    completed_by_type character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    remark_edit_history jsonb DEFAULT '[]'::jsonb NOT NULL
);


ALTER TABLE public.task_logs OWNER TO platform_admin;

--
-- Name: COLUMN task_logs.remark_edit_history; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON COLUMN public.task_logs.remark_edit_history IS 'Append-only JSON array of remark edits: [{ editedAt, editedByUserId, editedByUsername, previousRemark, newRemark }]';


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.tasks (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    sla_to_complete integer NOT NULL,
    is_system_triggered boolean DEFAULT false,
    trigger_event character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tasks OWNER TO platform_admin;

--
-- Name: user_assignment_scopes; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.user_assignment_scopes (
    id integer NOT NULL,
    user_assignment_id integer NOT NULL,
    scope_type character varying(50) NOT NULL,
    scope_id character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_assignment_scopes OWNER TO platform_admin;

--
-- Name: TABLE user_assignment_scopes; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.user_assignment_scopes IS 'User assignment scopes (archetype/hospital unit)';


--
-- Name: user_assignment_scopes_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.user_assignment_scopes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_assignment_scopes_id_seq OWNER TO platform_admin;

--
-- Name: user_assignment_scopes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.user_assignment_scopes_id_seq OWNED BY public.user_assignment_scopes.id;


--
-- Name: user_assignments; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.user_assignments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    role_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_assignments OWNER TO platform_admin;

--
-- Name: TABLE user_assignments; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.user_assignments IS 'User role assignments normalized from users.assignments JSONB';


--
-- Name: user_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.user_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_assignments_id_seq OWNER TO platform_admin;

--
-- Name: user_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.user_assignments_id_seq OWNED BY public.user_assignments.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    phone_number character varying(50),
    auth_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO platform_admin;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO platform_admin;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.vendors (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    address text,
    contact_person character varying(255),
    contact_email character varying(255),
    contact_phone character varying(50),
    npwp character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.vendors OWNER TO platform_admin;

--
-- Name: workflow_sets; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.workflow_sets (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.workflow_sets OWNER TO platform_admin;

--
-- Name: workflow_step_roles; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.workflow_step_roles (
    id integer NOT NULL,
    workflow_step_id integer NOT NULL,
    role_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.workflow_step_roles OWNER TO platform_admin;

--
-- Name: TABLE workflow_step_roles; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.workflow_step_roles IS 'Roles assigned to workflow steps';


--
-- Name: workflow_step_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.workflow_step_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workflow_step_roles_id_seq OWNER TO platform_admin;

--
-- Name: workflow_step_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.workflow_step_roles_id_seq OWNED BY public.workflow_step_roles.id;


--
-- Name: workflow_step_triggers; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.workflow_step_triggers (
    id integer NOT NULL,
    workflow_step_id integer NOT NULL,
    triggering_task_id character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.workflow_step_triggers OWNER TO platform_admin;

--
-- Name: TABLE workflow_step_triggers; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.workflow_step_triggers IS 'Triggering tasks for workflow steps';


--
-- Name: workflow_step_triggers_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.workflow_step_triggers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workflow_step_triggers_id_seq OWNER TO platform_admin;

--
-- Name: workflow_step_triggers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.workflow_step_triggers_id_seq OWNED BY public.workflow_step_triggers.id;


--
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: platform_admin
--

CREATE TABLE public.workflow_steps (
    id integer NOT NULL,
    workflow_set_id character varying(255) NOT NULL,
    step_order integer NOT NULL,
    task_id character varying(255) NOT NULL,
    sla_to_complete integer NOT NULL,
    task_score integer DEFAULT 0 NOT NULL,
    milestone_score integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.workflow_steps OWNER TO platform_admin;

--
-- Name: TABLE workflow_steps; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON TABLE public.workflow_steps IS 'Workflow steps normalized from workflow_sets.steps JSONB';


--
-- Name: workflow_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: platform_admin
--

CREATE SEQUENCE public.workflow_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workflow_steps_id_seq OWNER TO platform_admin;

--
-- Name: workflow_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: platform_admin
--

ALTER SEQUENCE public.workflow_steps_id_seq OWNED BY public.workflow_steps.id;


--
-- Name: api_audit_logs id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.api_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.api_audit_logs_id_seq'::regclass);


--
-- Name: budget_period_archetype_budgets id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_archetype_budgets ALTER COLUMN id SET DEFAULT nextval('public.budget_period_archetype_budgets_id_seq'::regclass);


--
-- Name: budget_period_category_budgets id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_category_budgets ALTER COLUMN id SET DEFAULT nextval('public.budget_period_category_budgets_id_seq'::regclass);


--
-- Name: budget_period_hospital_unit_budgets id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_hospital_unit_budgets ALTER COLUMN id SET DEFAULT nextval('public.budget_period_hospital_unit_budgets_id_seq'::regclass);


--
-- Name: login_audit_logs id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.login_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.login_audit_logs_id_seq'::regclass);


--
-- Name: project_category_budgets id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_category_budgets ALTER COLUMN id SET DEFAULT nextval('public.project_category_budgets_id_seq'::regclass);


--
-- Name: project_pipeline_items id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_pipeline_items ALTER COLUMN id SET DEFAULT nextval('public.project_pipeline_items_id_seq'::regclass);


--
-- Name: purchase_order_items id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.purchase_order_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_items_id_seq'::regclass);


--
-- Name: role_permissions id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.role_permissions ALTER COLUMN id SET DEFAULT nextval('public.role_permissions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: user_assignment_scopes id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.user_assignment_scopes ALTER COLUMN id SET DEFAULT nextval('public.user_assignment_scopes_id_seq'::regclass);


--
-- Name: user_assignments id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.user_assignments ALTER COLUMN id SET DEFAULT nextval('public.user_assignments_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: workflow_step_roles id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_roles ALTER COLUMN id SET DEFAULT nextval('public.workflow_step_roles_id_seq'::regclass);


--
-- Name: workflow_step_triggers id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_triggers ALTER COLUMN id SET DEFAULT nextval('public.workflow_step_triggers_id_seq'::regclass);


--
-- Name: workflow_steps id; Type: DEFAULT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_steps ALTER COLUMN id SET DEFAULT nextval('public.workflow_steps_id_seq'::regclass);


--
-- Name: adhoc_tasks adhoc_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.adhoc_tasks
    ADD CONSTRAINT adhoc_tasks_pkey PRIMARY KEY (id);


--
-- Name: api_audit_logs api_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.api_audit_logs
    ADD CONSTRAINT api_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);


--
-- Name: archetypes_config archetypes_config_code_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.archetypes_config
    ADD CONSTRAINT archetypes_config_code_key UNIQUE (code);


--
-- Name: archetypes_config archetypes_config_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.archetypes_config
    ADD CONSTRAINT archetypes_config_pkey PRIMARY KEY (id);


--
-- Name: asset_code_sequences asset_code_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_code_sequences
    ADD CONSTRAINT asset_code_sequences_pkey PRIMARY KEY (project_code);


--
-- Name: asset_tags asset_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_tags
    ADD CONSTRAINT asset_tags_pkey PRIMARY KEY (id);


--
-- Name: asset_task_statuses asset_task_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_task_statuses
    ADD CONSTRAINT asset_task_statuses_pkey PRIMARY KEY (id);


--
-- Name: asset_type_configs asset_type_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_type_configs
    ADD CONSTRAINT asset_type_configs_pkey PRIMARY KEY (id);


--
-- Name: asset_type_groups asset_type_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_type_groups
    ADD CONSTRAINT asset_type_groups_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: budget_category_configs budget_category_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_category_configs
    ADD CONSTRAINT budget_category_configs_pkey PRIMARY KEY (id);


--
-- Name: budget_multi_years budget_multi_years_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_multi_years
    ADD CONSTRAINT budget_multi_years_pkey PRIMARY KEY (name);


--
-- Name: budget_period_archetype_budgets budget_period_archetype_budge_period_name_archetype_id_budg_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_archetype_budgets
    ADD CONSTRAINT budget_period_archetype_budge_period_name_archetype_id_budg_key UNIQUE (period_name, archetype_id, budget_category_id);


--
-- Name: budget_period_archetype_budgets budget_period_archetype_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_archetype_budgets
    ADD CONSTRAINT budget_period_archetype_budgets_pkey PRIMARY KEY (id);


--
-- Name: budget_period_category_budgets budget_period_category_budget_period_name_budget_category_i_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_category_budgets
    ADD CONSTRAINT budget_period_category_budget_period_name_budget_category_i_key UNIQUE (period_name, budget_category_id);


--
-- Name: budget_period_category_budgets budget_period_category_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_category_budgets
    ADD CONSTRAINT budget_period_category_budgets_pkey PRIMARY KEY (id);


--
-- Name: budget_period_hospital_unit_budgets budget_period_hospital_unit_b_period_name_hospital_unit_id__key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_hospital_unit_budgets
    ADD CONSTRAINT budget_period_hospital_unit_b_period_name_hospital_unit_id__key UNIQUE (period_name, hospital_unit_id, budget_category_id);


--
-- Name: budget_period_hospital_unit_budgets budget_period_hospital_unit_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_hospital_unit_budgets
    ADD CONSTRAINT budget_period_hospital_unit_budgets_pkey PRIMARY KEY (id);


--
-- Name: budget_periods budget_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_periods
    ADD CONSTRAINT budget_periods_pkey PRIMARY KEY (period_name);


--
-- Name: feasibility_studies feasibility_studies_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.feasibility_studies
    ADD CONSTRAINT feasibility_studies_pkey PRIMARY KEY (id);


--
-- Name: fs_realizations fs_realizations_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.fs_realizations
    ADD CONSTRAINT fs_realizations_pkey PRIMARY KEY (id);


--
-- Name: hospital_units_config hospital_units_config_code_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.hospital_units_config
    ADD CONSTRAINT hospital_units_config_code_key UNIQUE (code);


--
-- Name: hospital_units_config hospital_units_config_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.hospital_units_config
    ADD CONSTRAINT hospital_units_config_pkey PRIMARY KEY (id);


--
-- Name: login_audit_logs login_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.login_audit_logs
    ADD CONSTRAINT login_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: master_catalogue master_catalogue_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.master_catalogue
    ADD CONSTRAINT master_catalogue_pkey PRIMARY KEY (id);


--
-- Name: moms moms_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.moms
    ADD CONSTRAINT moms_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offline_data offline_data_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.offline_data
    ADD CONSTRAINT offline_data_pkey PRIMARY KEY (id);


--
-- Name: project_category_budgets project_category_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_category_budgets
    ADD CONSTRAINT project_category_budgets_pkey PRIMARY KEY (id);


--
-- Name: project_category_budgets project_category_budgets_project_id_budget_category_id_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_category_budgets
    ADD CONSTRAINT project_category_budgets_project_id_budget_category_id_key UNIQUE (project_id, budget_category_id);


--
-- Name: project_code_sequences project_code_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_code_sequences
    ADD CONSTRAINT project_code_sequences_pkey PRIMARY KEY (hu_code, yy);


--
-- Name: project_pipeline_items project_pipeline_items_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_pipeline_items
    ADD CONSTRAINT project_pipeline_items_pkey PRIMARY KEY (id);


--
-- Name: project_priority_configs project_priority_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_priority_configs
    ADD CONSTRAINT project_priority_configs_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_project_code_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_project_code_key UNIQUE (project_code);


--
-- Name: projects projects_project_code_unique; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_project_code_unique UNIQUE (project_code);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_number_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);


--
-- Name: regionals_config regionals_config_code_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.regionals_config
    ADD CONSTRAINT regionals_config_code_key UNIQUE (code);


--
-- Name: regionals_config regionals_config_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.regionals_config
    ADD CONSTRAINT regionals_config_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_id_hierarchy_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_hierarchy_key UNIQUE (role_id, hierarchy);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);


--
-- Name: rooms_config rooms_config_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.rooms_config
    ADD CONSTRAINT rooms_config_pkey PRIMARY KEY (id);


--
-- Name: task_logs task_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.task_logs
    ADD CONSTRAINT task_logs_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: user_assignment_scopes user_assignment_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.user_assignment_scopes
    ADD CONSTRAINT user_assignment_scopes_pkey PRIMARY KEY (id);


--
-- Name: user_assignments user_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.user_assignments
    ADD CONSTRAINT user_assignments_pkey PRIMARY KEY (id);


--
-- Name: user_assignments user_assignments_user_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.user_assignments
    ADD CONSTRAINT user_assignments_user_id_role_id_key UNIQUE (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: workflow_sets workflow_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_sets
    ADD CONSTRAINT workflow_sets_pkey PRIMARY KEY (id);


--
-- Name: workflow_step_roles workflow_step_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_roles
    ADD CONSTRAINT workflow_step_roles_pkey PRIMARY KEY (id);


--
-- Name: workflow_step_roles workflow_step_roles_workflow_step_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_roles
    ADD CONSTRAINT workflow_step_roles_workflow_step_id_role_id_key UNIQUE (workflow_step_id, role_id);


--
-- Name: workflow_step_triggers workflow_step_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_triggers
    ADD CONSTRAINT workflow_step_triggers_pkey PRIMARY KEY (id);


--
-- Name: workflow_step_triggers workflow_step_triggers_workflow_step_id_triggering_task_id_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_triggers
    ADD CONSTRAINT workflow_step_triggers_workflow_step_id_triggering_task_id_key UNIQUE (workflow_step_id, triggering_task_id);


--
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: workflow_steps workflow_steps_workflow_set_id_step_order_key; Type: CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_workflow_set_id_step_order_key UNIQUE (workflow_set_id, step_order);


--
-- Name: idx_adhoc_tasks_asset; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_adhoc_tasks_asset ON public.adhoc_tasks USING btree (asset_id);


--
-- Name: idx_adhoc_tasks_assigned_to; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_adhoc_tasks_assigned_to ON public.adhoc_tasks USING btree (assigned_to_user_id);


--
-- Name: idx_adhoc_tasks_created_by_user_at; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_adhoc_tasks_created_by_user_at ON public.adhoc_tasks USING btree (created_by_user_id, created_at DESC) WHERE (created_by_user_id IS NOT NULL);


--
-- Name: idx_adhoc_tasks_due_date; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_adhoc_tasks_due_date ON public.adhoc_tasks USING btree (due_date);


--
-- Name: idx_adhoc_tasks_status; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_adhoc_tasks_status ON public.adhoc_tasks USING btree (status);


--
-- Name: idx_api_audit_logs_created_at; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_api_audit_logs_created_at ON public.api_audit_logs USING btree (created_at DESC);


--
-- Name: idx_api_audit_logs_user_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_api_audit_logs_user_id ON public.api_audit_logs USING btree (user_id);


--
-- Name: idx_asset_task_statuses_asset; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_asset_task_statuses_asset ON public.asset_task_statuses USING btree (asset_id);


--
-- Name: idx_asset_task_statuses_status; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_asset_task_statuses_status ON public.asset_task_statuses USING btree (status);


--
-- Name: idx_asset_task_statuses_task; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_asset_task_statuses_task ON public.asset_task_statuses USING btree (task_id);


--
-- Name: idx_asset_type_configs_group; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_asset_type_configs_group ON public.asset_type_configs USING btree (group_id);


--
-- Name: idx_asset_type_configs_workflow; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_asset_type_configs_workflow ON public.asset_type_configs USING btree (workflow_set_id);


--
-- Name: idx_assets_asset_code_trgm; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_asset_code_trgm ON public.assets USING gin (asset_code public.gin_trgm_ops);


--
-- Name: idx_assets_asset_name_trgm; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_asset_name_trgm ON public.assets USING gin (asset_name public.gin_trgm_ops);


--
-- Name: INDEX idx_assets_asset_name_trgm; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON INDEX public.idx_assets_asset_name_trgm IS 'Capex project list server-side search';


--
-- Name: idx_assets_asset_type; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_asset_type ON public.assets USING btree (asset_type_id);


--
-- Name: idx_assets_catalogue; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_catalogue ON public.assets USING btree (catalogue_id);


--
-- Name: idx_assets_category; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_category ON public.assets USING btree (budget_category_id);


--
-- Name: idx_assets_code; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_code ON public.assets USING btree (asset_code);


--
-- Name: idx_assets_end_target_date; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_end_target_date ON public.assets USING btree (end_target_date);


--
-- Name: idx_assets_lifecycle_status; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_lifecycle_status ON public.assets USING btree (lifecycle_status) WHERE (lifecycle_status IS NOT NULL);


--
-- Name: idx_assets_po_number; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_po_number ON public.assets USING btree (po_number);


--
-- Name: idx_assets_project; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_project ON public.assets USING btree (project_id);


--
-- Name: idx_assets_project_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_project_id ON public.assets USING btree (project_id);


--
-- Name: idx_assets_workflow; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_workflow ON public.assets USING btree (workflow_set_id);


--
-- Name: idx_assets_workflow_set_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_assets_workflow_set_id ON public.assets USING btree (workflow_set_id);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_id);


--
-- Name: idx_audit_logs_entity_type; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs USING btree (entity_type);


--
-- Name: idx_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp");


--
-- Name: idx_auth_sessions_expires_at; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_auth_sessions_expires_at ON public.auth_sessions USING btree (expires_at);


--
-- Name: idx_auth_sessions_family_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_auth_sessions_family_id ON public.auth_sessions USING btree (family_id);


--
-- Name: idx_auth_sessions_refresh_hash; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_auth_sessions_refresh_hash ON public.auth_sessions USING btree (refresh_token_hash);


--
-- Name: idx_auth_sessions_user_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_auth_sessions_user_id ON public.auth_sessions USING btree (user_id);


--
-- Name: idx_auth_sessions_user_last_active; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_auth_sessions_user_last_active ON public.auth_sessions USING btree (user_id, last_active_at DESC) WHERE ((revoked_at IS NULL) AND (user_id IS NOT NULL));


--
-- Name: idx_budget_period_archetype_budgets_archetype; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_period_archetype_budgets_archetype ON public.budget_period_archetype_budgets USING btree (archetype_id);


--
-- Name: idx_budget_period_archetype_budgets_category; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_period_archetype_budgets_category ON public.budget_period_archetype_budgets USING btree (budget_category_id);


--
-- Name: idx_budget_period_archetype_budgets_period; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_period_archetype_budgets_period ON public.budget_period_archetype_budgets USING btree (period_name);


--
-- Name: idx_budget_period_category_budgets_category; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_period_category_budgets_category ON public.budget_period_category_budgets USING btree (budget_category_id);


--
-- Name: idx_budget_period_category_budgets_period; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_period_category_budgets_period ON public.budget_period_category_budgets USING btree (period_name);


--
-- Name: idx_budget_period_hu_budgets_category; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_period_hu_budgets_category ON public.budget_period_hospital_unit_budgets USING btree (budget_category_id);


--
-- Name: idx_budget_period_hu_budgets_hospital_unit; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_period_hu_budgets_hospital_unit ON public.budget_period_hospital_unit_budgets USING btree (hospital_unit_id);


--
-- Name: idx_budget_period_hu_budgets_period; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_period_hu_budgets_period ON public.budget_period_hospital_unit_budgets USING btree (period_name);


--
-- Name: idx_budget_periods_multi_year; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_budget_periods_multi_year ON public.budget_periods USING btree (multi_year_name);


--
-- Name: idx_feasibility_studies_project_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_feasibility_studies_project_id ON public.feasibility_studies USING btree (project_id);


--
-- Name: idx_fs_realizations_fs_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_fs_realizations_fs_id ON public.fs_realizations USING btree (fs_id);


--
-- Name: idx_hospital_units_archetype; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_hospital_units_archetype ON public.hospital_units_config USING btree (archetype_id);


--
-- Name: idx_hospital_units_archetype_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_hospital_units_archetype_id ON public.hospital_units_config USING btree (archetype_id);


--
-- Name: idx_hospital_units_code; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_hospital_units_code ON public.hospital_units_config USING btree (code);


--
-- Name: idx_hospital_units_config_is_pipeline; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_hospital_units_config_is_pipeline ON public.hospital_units_config USING btree (is_pipeline) WHERE (is_pipeline = true);


--
-- Name: idx_hospital_units_config_name_trgm; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_hospital_units_config_name_trgm ON public.hospital_units_config USING gin (name public.gin_trgm_ops);


--
-- Name: idx_hospital_units_regional; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_hospital_units_regional ON public.hospital_units_config USING btree (regional_id);


--
-- Name: idx_login_audit_logs_created_at; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_login_audit_logs_created_at ON public.login_audit_logs USING btree (created_at DESC);


--
-- Name: idx_login_audit_logs_event_type; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_login_audit_logs_event_type ON public.login_audit_logs USING btree (event_type);


--
-- Name: idx_login_audit_logs_suspicious; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_login_audit_logs_suspicious ON public.login_audit_logs USING btree (is_suspicious) WHERE (is_suspicious = true);


--
-- Name: idx_login_audit_logs_user_created; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_login_audit_logs_user_created ON public.login_audit_logs USING btree (user_id, created_at DESC) WHERE ((user_id IS NOT NULL) AND COALESCE(success, true));


--
-- Name: idx_login_audit_logs_user_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_login_audit_logs_user_id ON public.login_audit_logs USING btree (user_id);


--
-- Name: idx_master_catalogue_category; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_master_catalogue_category ON public.master_catalogue USING btree (category);


--
-- Name: idx_master_catalogue_rds_code; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_master_catalogue_rds_code ON public.master_catalogue USING btree (rds_code);


--
-- Name: idx_moms_asset; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_moms_asset ON public.moms USING btree (asset_id);


--
-- Name: idx_moms_created_by; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_moms_created_by ON public.moms USING btree (created_by_user_id);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_offline_data_dataset; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_offline_data_dataset ON public.offline_data USING btree (dataset_name);


--
-- Name: idx_offline_data_status; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_offline_data_status ON public.offline_data USING btree (status);


--
-- Name: idx_project_category_budgets_category; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_project_category_budgets_category ON public.project_category_budgets USING btree (budget_category_id);


--
-- Name: idx_project_category_budgets_project; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_project_category_budgets_project ON public.project_category_budgets USING btree (project_id);


--
-- Name: idx_project_pipeline_items_catalogue; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_project_pipeline_items_catalogue ON public.project_pipeline_items USING btree (catalogue_id);


--
-- Name: idx_project_pipeline_items_hospital_unit; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_project_pipeline_items_hospital_unit ON public.project_pipeline_items USING btree (hospital_unit_id);


--
-- Name: idx_project_pipeline_items_project; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_project_pipeline_items_project ON public.project_pipeline_items USING btree (project_id);


--
-- Name: idx_project_pipeline_items_room; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_project_pipeline_items_room ON public.project_pipeline_items USING btree (room_id);


--
-- Name: idx_projects_ax_code; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_ax_code ON public.projects USING btree (ax_code);


--
-- Name: idx_projects_category; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_category ON public.projects USING btree (budget_category_id);


--
-- Name: idx_projects_code; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_code ON public.projects USING btree (project_code);


--
-- Name: idx_projects_dates; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_dates ON public.projects USING btree (target_start, end_date);


--
-- Name: idx_projects_hospital_unit; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_hospital_unit ON public.projects USING btree (hospital_unit_id);


--
-- Name: idx_projects_hospital_unit_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_hospital_unit_id ON public.projects USING btree (hospital_unit_id);


--
-- Name: idx_projects_owner; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_owner ON public.projects USING btree (owner);


--
-- Name: idx_projects_period_budget_category; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_budget_category ON public.projects USING btree (period_name, budget_category_id);


--
-- Name: idx_projects_period_completion; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_completion ON public.projects USING btree (period_name, completion_rate);


--
-- Name: idx_projects_period_completion_status; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_completion_status ON public.projects USING btree (period_name, completion_rate, status);


--
-- Name: idx_projects_period_hospital_unit; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_hospital_unit ON public.projects USING btree (period_name, hospital_unit_id);


--
-- Name: idx_projects_period_name; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_name ON public.projects USING btree (period_name);


--
-- Name: idx_projects_period_name_lower; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_name_lower ON public.projects USING btree (period_name, lower((project_name)::text));


--
-- Name: idx_projects_period_pipeline; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_pipeline ON public.projects USING btree (period_name, is_pipeline_project);


--
-- Name: idx_projects_period_priority; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_priority ON public.projects USING btree (period_name, priority_id);


--
-- Name: idx_projects_period_sort_name; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_sort_name ON public.projects USING btree (period_name, project_name);


--
-- Name: idx_projects_period_sort_revenue; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_sort_revenue ON public.projects USING btree (period_name, revenue_projection DESC);


--
-- Name: idx_projects_period_status; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_period_status ON public.projects USING btree (period_name, status);


--
-- Name: idx_projects_priority; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_priority ON public.projects USING btree (priority_id);


--
-- Name: idx_projects_project_code_trgm; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_project_code_trgm ON public.projects USING gin (project_code public.gin_trgm_ops);


--
-- Name: idx_projects_project_name_trgm; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_project_name_trgm ON public.projects USING gin (project_name public.gin_trgm_ops);


--
-- Name: INDEX idx_projects_project_name_trgm; Type: COMMENT; Schema: public; Owner: platform_admin
--

COMMENT ON INDEX public.idx_projects_project_name_trgm IS 'Capex project list server-side search';


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_projects_type; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_projects_type ON public.projects USING btree (type);


--
-- Name: idx_purchase_order_items_catalogue; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_purchase_order_items_catalogue ON public.purchase_order_items USING btree (catalogue_id);


--
-- Name: idx_purchase_order_items_po; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_purchase_order_items_po ON public.purchase_order_items USING btree (purchase_order_id);


--
-- Name: idx_purchase_orders_po_number; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_purchase_orders_po_number ON public.purchase_orders USING btree (po_number);


--
-- Name: idx_purchase_orders_project; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_purchase_orders_project ON public.purchase_orders USING btree (project_id);


--
-- Name: idx_purchase_orders_status; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_purchase_orders_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_purchase_orders_vendor; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_purchase_orders_vendor ON public.purchase_orders USING btree (vendor_id);


--
-- Name: idx_role_permissions_hierarchy; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_role_permissions_hierarchy ON public.role_permissions USING btree (hierarchy);


--
-- Name: idx_role_permissions_role; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role_id);


--
-- Name: idx_task_logs_asset; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_task_logs_asset ON public.task_logs USING btree (asset_id);


--
-- Name: idx_task_logs_completed_by; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_task_logs_completed_by ON public.task_logs USING btree (completed_by_user_id);


--
-- Name: idx_task_logs_completed_by_user_at; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_task_logs_completed_by_user_at ON public.task_logs USING btree (completed_by_user_id, completed_at DESC) WHERE (completed_by_user_id IS NOT NULL);


--
-- Name: idx_task_logs_task; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_task_logs_task ON public.task_logs USING btree (task_id);


--
-- Name: idx_tasks_trigger_event; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_tasks_trigger_event ON public.tasks USING btree (trigger_event);


--
-- Name: idx_user_assignment_scopes_assignment; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_user_assignment_scopes_assignment ON public.user_assignment_scopes USING btree (user_assignment_id);


--
-- Name: idx_user_assignment_scopes_scope; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_user_assignment_scopes_scope ON public.user_assignment_scopes USING btree (scope_type, scope_id);


--
-- Name: idx_user_assignments_role; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_user_assignments_role ON public.user_assignments USING btree (role_id);


--
-- Name: idx_user_assignments_user; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_user_assignments_user ON public.user_assignments USING btree (user_id);


--
-- Name: idx_users_auth_id; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_users_auth_id ON public.users USING btree (auth_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_vendors_name; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_vendors_name ON public.vendors USING btree (name);


--
-- Name: idx_workflow_step_roles_role; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_workflow_step_roles_role ON public.workflow_step_roles USING btree (role_id);


--
-- Name: idx_workflow_step_roles_step; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_workflow_step_roles_step ON public.workflow_step_roles USING btree (workflow_step_id);


--
-- Name: idx_workflow_step_triggers_step; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_workflow_step_triggers_step ON public.workflow_step_triggers USING btree (workflow_step_id);


--
-- Name: idx_workflow_step_triggers_task; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_workflow_step_triggers_task ON public.workflow_step_triggers USING btree (triggering_task_id);


--
-- Name: idx_workflow_steps_order; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_workflow_steps_order ON public.workflow_steps USING btree (workflow_set_id, step_order);


--
-- Name: idx_workflow_steps_task; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_workflow_steps_task ON public.workflow_steps USING btree (task_id);


--
-- Name: idx_workflow_steps_workflow; Type: INDEX; Schema: public; Owner: platform_admin
--

CREATE INDEX idx_workflow_steps_workflow ON public.workflow_steps USING btree (workflow_set_id);


--
-- Name: audit_logs audit_logs_append_only; Type: TRIGGER; Schema: public; Owner: platform_admin
--

CREATE TRIGGER audit_logs_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.capex_prevent_audit_mutation();


--
-- Name: login_audit_logs login_audit_logs_append_only; Type: TRIGGER; Schema: public; Owner: platform_admin
--

CREATE TRIGGER login_audit_logs_append_only BEFORE DELETE OR UPDATE ON public.login_audit_logs FOR EACH ROW EXECUTE FUNCTION public.capex_prevent_audit_mutation();


--
-- Name: assets trigger_send_asset; Type: TRIGGER; Schema: public; Owner: platform_admin
--

CREATE TRIGGER trigger_send_asset AFTER INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION public.send_asset_to_power_automate();


--
-- Name: adhoc_tasks adhoc_tasks_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.adhoc_tasks
    ADD CONSTRAINT adhoc_tasks_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: adhoc_tasks adhoc_tasks_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.adhoc_tasks
    ADD CONSTRAINT adhoc_tasks_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: adhoc_tasks adhoc_tasks_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.adhoc_tasks
    ADD CONSTRAINT adhoc_tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: api_audit_logs api_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.api_audit_logs
    ADD CONSTRAINT api_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: asset_task_statuses asset_task_statuses_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_task_statuses
    ADD CONSTRAINT asset_task_statuses_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_task_statuses asset_task_statuses_reported_not_yet_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_task_statuses
    ADD CONSTRAINT asset_task_statuses_reported_not_yet_by_user_id_fkey FOREIGN KEY (reported_not_yet_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: asset_task_statuses asset_task_statuses_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_task_statuses
    ADD CONSTRAINT asset_task_statuses_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE RESTRICT;


--
-- Name: asset_type_configs asset_type_configs_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_type_configs
    ADD CONSTRAINT asset_type_configs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.asset_type_groups(id) ON DELETE SET NULL;


--
-- Name: asset_type_configs asset_type_configs_workflow_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.asset_type_configs
    ADD CONSTRAINT asset_type_configs_workflow_set_id_fkey FOREIGN KEY (workflow_set_id) REFERENCES public.workflow_sets(id) ON DELETE RESTRICT;


--
-- Name: assets assets_asset_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.asset_type_configs(id) ON DELETE SET NULL;


--
-- Name: assets assets_budget_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_budget_category_id_fkey FOREIGN KEY (budget_category_id) REFERENCES public.budget_category_configs(id) ON DELETE RESTRICT;


--
-- Name: assets assets_catalogue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_catalogue_id_fkey FOREIGN KEY (catalogue_id) REFERENCES public.master_catalogue(id) ON DELETE SET NULL;


--
-- Name: assets assets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: assets assets_workflow_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_workflow_set_id_fkey FOREIGN KEY (workflow_set_id) REFERENCES public.workflow_sets(id) ON DELETE RESTRICT;


--
-- Name: auth_sessions auth_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: budget_period_archetype_budgets budget_period_archetype_budgets_archetype_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_archetype_budgets
    ADD CONSTRAINT budget_period_archetype_budgets_archetype_id_fkey FOREIGN KEY (archetype_id) REFERENCES public.archetypes_config(id) ON DELETE CASCADE;


--
-- Name: budget_period_archetype_budgets budget_period_archetype_budgets_budget_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_archetype_budgets
    ADD CONSTRAINT budget_period_archetype_budgets_budget_category_id_fkey FOREIGN KEY (budget_category_id) REFERENCES public.budget_category_configs(id) ON DELETE RESTRICT;


--
-- Name: budget_period_archetype_budgets budget_period_archetype_budgets_period_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_archetype_budgets
    ADD CONSTRAINT budget_period_archetype_budgets_period_name_fkey FOREIGN KEY (period_name) REFERENCES public.budget_periods(period_name) ON DELETE CASCADE;


--
-- Name: budget_period_category_budgets budget_period_category_budgets_budget_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_category_budgets
    ADD CONSTRAINT budget_period_category_budgets_budget_category_id_fkey FOREIGN KEY (budget_category_id) REFERENCES public.budget_category_configs(id) ON DELETE RESTRICT;


--
-- Name: budget_period_category_budgets budget_period_category_budgets_period_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_category_budgets
    ADD CONSTRAINT budget_period_category_budgets_period_name_fkey FOREIGN KEY (period_name) REFERENCES public.budget_periods(period_name) ON DELETE CASCADE;


--
-- Name: budget_period_hospital_unit_budgets budget_period_hospital_unit_budgets_budget_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_hospital_unit_budgets
    ADD CONSTRAINT budget_period_hospital_unit_budgets_budget_category_id_fkey FOREIGN KEY (budget_category_id) REFERENCES public.budget_category_configs(id) ON DELETE RESTRICT;


--
-- Name: budget_period_hospital_unit_budgets budget_period_hospital_unit_budgets_hospital_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_hospital_unit_budgets
    ADD CONSTRAINT budget_period_hospital_unit_budgets_hospital_unit_id_fkey FOREIGN KEY (hospital_unit_id) REFERENCES public.hospital_units_config(id) ON DELETE CASCADE;


--
-- Name: budget_period_hospital_unit_budgets budget_period_hospital_unit_budgets_period_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_period_hospital_unit_budgets
    ADD CONSTRAINT budget_period_hospital_unit_budgets_period_name_fkey FOREIGN KEY (period_name) REFERENCES public.budget_periods(period_name) ON DELETE CASCADE;


--
-- Name: budget_periods budget_periods_multi_year_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.budget_periods
    ADD CONSTRAINT budget_periods_multi_year_name_fkey FOREIGN KEY (multi_year_name) REFERENCES public.budget_multi_years(name) ON DELETE RESTRICT;


--
-- Name: feasibility_studies feasibility_studies_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.feasibility_studies
    ADD CONSTRAINT feasibility_studies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: fs_realizations fs_realizations_fs_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.fs_realizations
    ADD CONSTRAINT fs_realizations_fs_id_fkey FOREIGN KEY (fs_id) REFERENCES public.feasibility_studies(id) ON DELETE CASCADE;


--
-- Name: hospital_units_config hospital_units_config_archetype_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.hospital_units_config
    ADD CONSTRAINT hospital_units_config_archetype_id_fkey FOREIGN KEY (archetype_id) REFERENCES public.archetypes_config(id) ON DELETE RESTRICT;


--
-- Name: hospital_units_config hospital_units_config_regional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.hospital_units_config
    ADD CONSTRAINT hospital_units_config_regional_id_fkey FOREIGN KEY (regional_id) REFERENCES public.regionals_config(id) ON DELETE RESTRICT;


--
-- Name: login_audit_logs login_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.login_audit_logs
    ADD CONSTRAINT login_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: moms moms_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.moms
    ADD CONSTRAINT moms_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: moms moms_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.moms
    ADD CONSTRAINT moms_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: project_category_budgets project_category_budgets_budget_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_category_budgets
    ADD CONSTRAINT project_category_budgets_budget_category_id_fkey FOREIGN KEY (budget_category_id) REFERENCES public.budget_category_configs(id) ON DELETE RESTRICT;


--
-- Name: project_category_budgets project_category_budgets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_category_budgets
    ADD CONSTRAINT project_category_budgets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_pipeline_items project_pipeline_items_archetype_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_pipeline_items
    ADD CONSTRAINT project_pipeline_items_archetype_id_fkey FOREIGN KEY (archetype_id) REFERENCES public.archetypes_config(id) ON DELETE SET NULL;


--
-- Name: project_pipeline_items project_pipeline_items_catalogue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_pipeline_items
    ADD CONSTRAINT project_pipeline_items_catalogue_id_fkey FOREIGN KEY (catalogue_id) REFERENCES public.master_catalogue(id) ON DELETE RESTRICT;


--
-- Name: project_pipeline_items project_pipeline_items_hospital_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_pipeline_items
    ADD CONSTRAINT project_pipeline_items_hospital_unit_id_fkey FOREIGN KEY (hospital_unit_id) REFERENCES public.hospital_units_config(id) ON DELETE SET NULL;


--
-- Name: project_pipeline_items project_pipeline_items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_pipeline_items
    ADD CONSTRAINT project_pipeline_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_pipeline_items project_pipeline_items_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.project_pipeline_items
    ADD CONSTRAINT project_pipeline_items_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms_config(id) ON DELETE RESTRICT;


--
-- Name: projects projects_budget_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_budget_category_id_fkey FOREIGN KEY (budget_category_id) REFERENCES public.budget_category_configs(id) ON DELETE RESTRICT;


--
-- Name: projects projects_hospital_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_hospital_unit_id_fkey FOREIGN KEY (hospital_unit_id) REFERENCES public.hospital_units_config(id) ON DELETE RESTRICT;


--
-- Name: projects projects_period_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_period_name_fkey FOREIGN KEY (period_name) REFERENCES public.budget_periods(period_name) ON DELETE SET NULL;


--
-- Name: projects projects_priority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES public.project_priority_configs(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_items purchase_order_items_catalogue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_catalogue_id_fkey FOREIGN KEY (catalogue_id) REFERENCES public.master_catalogue(id) ON DELETE RESTRICT;


--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: task_logs task_logs_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.task_logs
    ADD CONSTRAINT task_logs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: task_logs task_logs_completed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.task_logs
    ADD CONSTRAINT task_logs_completed_by_user_id_fkey FOREIGN KEY (completed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: task_logs task_logs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.task_logs
    ADD CONSTRAINT task_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE RESTRICT;


--
-- Name: user_assignment_scopes user_assignment_scopes_user_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.user_assignment_scopes
    ADD CONSTRAINT user_assignment_scopes_user_assignment_id_fkey FOREIGN KEY (user_assignment_id) REFERENCES public.user_assignments(id) ON DELETE CASCADE;


--
-- Name: user_assignments user_assignments_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.user_assignments
    ADD CONSTRAINT user_assignments_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_assignments user_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.user_assignments
    ADD CONSTRAINT user_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workflow_step_roles workflow_step_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_roles
    ADD CONSTRAINT workflow_step_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: workflow_step_roles workflow_step_roles_workflow_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_roles
    ADD CONSTRAINT workflow_step_roles_workflow_step_id_fkey FOREIGN KEY (workflow_step_id) REFERENCES public.workflow_steps(id) ON DELETE CASCADE;


--
-- Name: workflow_step_triggers workflow_step_triggers_triggering_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_triggers
    ADD CONSTRAINT workflow_step_triggers_triggering_task_id_fkey FOREIGN KEY (triggering_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: workflow_step_triggers workflow_step_triggers_workflow_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_step_triggers
    ADD CONSTRAINT workflow_step_triggers_workflow_step_id_fkey FOREIGN KEY (workflow_step_id) REFERENCES public.workflow_steps(id) ON DELETE CASCADE;


--
-- Name: workflow_steps workflow_steps_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE RESTRICT;


--
-- Name: workflow_steps workflow_steps_workflow_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: platform_admin
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_workflow_set_id_fkey FOREIGN KEY (workflow_set_id) REFERENCES public.workflow_sets(id) ON DELETE CASCADE;


--
-- Name: adhoc_tasks; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.adhoc_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: api_audit_logs; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.api_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

--
-- Name: archetypes_config; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.archetypes_config ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_code_sequences; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.asset_code_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_tags; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.asset_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_task_statuses; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.asset_task_statuses ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_type_configs; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.asset_type_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: asset_type_groups; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.asset_type_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_sessions; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_sessions auth_sessions_deny_authenticated; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY auth_sessions_deny_authenticated ON public.auth_sessions TO authenticated USING (false) WITH CHECK (false);


--
-- Name: budget_category_configs; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.budget_category_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_multi_years; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.budget_multi_years ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_period_archetype_budgets; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.budget_period_archetype_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_period_category_budgets; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.budget_period_category_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_period_hospital_unit_budgets; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.budget_period_hospital_unit_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_periods; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.budget_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: feasibility_studies; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.feasibility_studies ENABLE ROW LEVEL SECURITY;

--
-- Name: fs_realizations; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.fs_realizations ENABLE ROW LEVEL SECURITY;

--
-- Name: hospital_units_config; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.hospital_units_config ENABLE ROW LEVEL SECURITY;

--
-- Name: login_audit_logs; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.login_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: master_catalogue; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.master_catalogue ENABLE ROW LEVEL SECURITY;

--
-- Name: moms; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.moms ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_owner_only; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY notifications_owner_only ON public.notifications TO authenticated USING ((user_id = (NULLIF(current_setting('app.current_user_id'::text, true), ''::text))::integer)) WITH CHECK ((user_id = (NULLIF(current_setting('app.current_user_id'::text, true), ''::text))::integer));


--
-- Name: offline_data; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.offline_data ENABLE ROW LEVEL SECURITY;

--
-- Name: project_category_budgets; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.project_category_budgets ENABLE ROW LEVEL SECURITY;

--
-- Name: project_code_sequences; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.project_code_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: project_pipeline_items; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.project_pipeline_items ENABLE ROW LEVEL SECURITY;

--
-- Name: project_priority_configs; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.project_priority_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: regionals_config; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.regionals_config ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms_config; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.rooms_config ENABLE ROW LEVEL SECURITY;

--
-- Name: adhoc_tasks sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.adhoc_tasks AS RESTRICTIVE TO anon USING (false);


--
-- Name: api_audit_logs sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.api_audit_logs AS RESTRICTIVE TO anon USING (false);


--
-- Name: app_config sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.app_config AS RESTRICTIVE TO anon USING (false);


--
-- Name: archetypes_config sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.archetypes_config AS RESTRICTIVE TO anon USING (false);


--
-- Name: asset_code_sequences sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.asset_code_sequences AS RESTRICTIVE TO anon USING (false);


--
-- Name: asset_tags sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.asset_tags AS RESTRICTIVE TO anon USING (false);


--
-- Name: asset_task_statuses sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.asset_task_statuses AS RESTRICTIVE TO anon USING (false);


--
-- Name: asset_type_configs sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.asset_type_configs AS RESTRICTIVE TO anon USING (false);


--
-- Name: asset_type_groups sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.asset_type_groups AS RESTRICTIVE TO anon USING (false);


--
-- Name: assets sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.assets AS RESTRICTIVE TO anon USING (false);


--
-- Name: audit_logs sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.audit_logs AS RESTRICTIVE TO anon USING (false);


--
-- Name: auth_sessions sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.auth_sessions AS RESTRICTIVE TO anon USING (false);


--
-- Name: budget_category_configs sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.budget_category_configs AS RESTRICTIVE TO anon USING (false);


--
-- Name: budget_multi_years sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.budget_multi_years AS RESTRICTIVE TO anon USING (false);


--
-- Name: budget_period_archetype_budgets sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.budget_period_archetype_budgets AS RESTRICTIVE TO anon USING (false);


--
-- Name: budget_period_category_budgets sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.budget_period_category_budgets AS RESTRICTIVE TO anon USING (false);


--
-- Name: budget_period_hospital_unit_budgets sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.budget_period_hospital_unit_budgets AS RESTRICTIVE TO anon USING (false);


--
-- Name: budget_periods sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.budget_periods AS RESTRICTIVE TO anon USING (false);


--
-- Name: feasibility_studies sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.feasibility_studies AS RESTRICTIVE TO anon USING (false);


--
-- Name: fs_realizations sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.fs_realizations AS RESTRICTIVE TO anon USING (false);


--
-- Name: hospital_units_config sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.hospital_units_config AS RESTRICTIVE TO anon USING (false);


--
-- Name: login_audit_logs sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.login_audit_logs AS RESTRICTIVE TO anon USING (false);


--
-- Name: master_catalogue sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.master_catalogue AS RESTRICTIVE TO anon USING (false);


--
-- Name: moms sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.moms AS RESTRICTIVE TO anon USING (false);


--
-- Name: notifications sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.notifications AS RESTRICTIVE TO anon USING (false);


--
-- Name: offline_data sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.offline_data AS RESTRICTIVE TO anon USING (false);


--
-- Name: project_category_budgets sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.project_category_budgets AS RESTRICTIVE TO anon USING (false);


--
-- Name: project_code_sequences sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.project_code_sequences AS RESTRICTIVE TO anon USING (false);


--
-- Name: project_pipeline_items sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.project_pipeline_items AS RESTRICTIVE TO anon USING (false);


--
-- Name: project_priority_configs sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.project_priority_configs AS RESTRICTIVE TO anon USING (false);


--
-- Name: projects sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.projects AS RESTRICTIVE TO anon USING (false);


--
-- Name: purchase_order_items sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.purchase_order_items AS RESTRICTIVE TO anon USING (false);


--
-- Name: purchase_orders sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.purchase_orders AS RESTRICTIVE TO anon USING (false);


--
-- Name: regionals_config sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.regionals_config AS RESTRICTIVE TO anon USING (false);


--
-- Name: role_permissions sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.role_permissions AS RESTRICTIVE TO anon USING (false);


--
-- Name: roles sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.roles AS RESTRICTIVE TO anon USING (false);


--
-- Name: rooms_config sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.rooms_config AS RESTRICTIVE TO anon USING (false);


--
-- Name: task_logs sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.task_logs AS RESTRICTIVE TO anon USING (false);


--
-- Name: tasks sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.tasks AS RESTRICTIVE TO anon USING (false);


--
-- Name: user_assignment_scopes sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.user_assignment_scopes AS RESTRICTIVE TO anon USING (false);


--
-- Name: user_assignments sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.user_assignments AS RESTRICTIVE TO anon USING (false);


--
-- Name: users sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.users AS RESTRICTIVE TO anon USING (false);


--
-- Name: vendors sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.vendors AS RESTRICTIVE TO anon USING (false);


--
-- Name: workflow_sets sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.workflow_sets AS RESTRICTIVE TO anon USING (false);


--
-- Name: workflow_step_roles sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.workflow_step_roles AS RESTRICTIVE TO anon USING (false);


--
-- Name: workflow_step_triggers sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.workflow_step_triggers AS RESTRICTIVE TO anon USING (false);


--
-- Name: workflow_steps sec_deny_anon_all; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_anon_all ON public.workflow_steps AS RESTRICTIVE TO anon USING (false);


--
-- Name: adhoc_tasks sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.adhoc_tasks AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: api_audit_logs sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.api_audit_logs AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: app_config sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.app_config AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: archetypes_config sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.archetypes_config AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: asset_code_sequences sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.asset_code_sequences AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: asset_tags sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.asset_tags AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: asset_task_statuses sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.asset_task_statuses AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: asset_type_configs sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.asset_type_configs AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: asset_type_groups sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.asset_type_groups AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: assets sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.assets AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: audit_logs sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.audit_logs AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: auth_sessions sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.auth_sessions AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: budget_category_configs sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.budget_category_configs AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: budget_multi_years sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.budget_multi_years AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: budget_period_archetype_budgets sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.budget_period_archetype_budgets AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: budget_period_category_budgets sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.budget_period_category_budgets AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: budget_period_hospital_unit_budgets sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.budget_period_hospital_unit_budgets AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: budget_periods sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.budget_periods AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: feasibility_studies sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.feasibility_studies AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: fs_realizations sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.fs_realizations AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: hospital_units_config sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.hospital_units_config AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: login_audit_logs sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.login_audit_logs AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: master_catalogue sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.master_catalogue AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: moms sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.moms AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: notifications sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.notifications AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: offline_data sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.offline_data AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: project_category_budgets sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.project_category_budgets AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: project_code_sequences sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.project_code_sequences AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: project_pipeline_items sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.project_pipeline_items AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: project_priority_configs sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.project_priority_configs AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: projects sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.projects AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: purchase_order_items sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.purchase_order_items AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: purchase_orders sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.purchase_orders AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: regionals_config sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.regionals_config AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: role_permissions sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.role_permissions AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: roles sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.roles AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: rooms_config sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.rooms_config AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: task_logs sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.task_logs AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: tasks sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.tasks AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: user_assignment_scopes sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.user_assignment_scopes AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: user_assignments sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.user_assignments AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: users sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.users AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: vendors sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.vendors AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: workflow_sets sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.workflow_sets AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: workflow_step_roles sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.workflow_step_roles AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: workflow_step_triggers sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.workflow_step_triggers AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: workflow_steps sec_deny_authenticated_direct; Type: POLICY; Schema: public; Owner: platform_admin
--

CREATE POLICY sec_deny_authenticated_direct ON public.workflow_steps AS RESTRICTIVE TO authenticated USING (false);


--
-- Name: task_logs; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.task_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_assignment_scopes; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.user_assignment_scopes ENABLE ROW LEVEL SECURITY;

--
-- Name: user_assignments; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.user_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: vendors; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_sets; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.workflow_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_step_roles; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.workflow_step_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_step_triggers; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.workflow_step_triggers ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_steps; Type: ROW SECURITY; Schema: public; Owner: platform_admin
--

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 6KW6Lxi1FA2bdIqGWfadSaCo6pXmtnjCIa1b3Q3O9UCAWgJRG0aDjYnZdKNMMhK

