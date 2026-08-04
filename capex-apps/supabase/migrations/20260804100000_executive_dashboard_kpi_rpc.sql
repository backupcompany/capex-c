-- Fast KPI aggregates for Executive Dashboard (SECURITY INVOKER = respects RLS).
-- Optional p_archetype_id: NULL = network-wide totals from budget_period_category_budgets.

CREATE OR REPLACE FUNCTION public.executive_dashboard_kpi(
  p_period_name text,
  p_archetype_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.executive_dashboard_kpi(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executive_dashboard_kpi(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.executive_dashboard_kpi(text, text) TO service_role;
