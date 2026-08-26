import type { SupabaseClient } from '@supabase/supabase-js';

type AssetPaPayload = {
  assetCode: string | null;
  assetName: string;
  projectId: string;
};

/**
 * Fire-and-forget Power Automate webhook after asset INSERT.
 * Canonical path for Siloam (no pg_net). Never throws / never blocks save.
 * Skip when POWER_AUTOMATE_ASSET_WEBHOOK_URL is unset.
 */
export function notifyAssetCreatedToPowerAutomate(
  client: SupabaseClient,
  input: AssetPaPayload,
): void {
  const url = process.env.POWER_AUTOMATE_ASSET_WEBHOOK_URL?.trim();
  if (!url) return;

  const assetCode = input.assetCode?.trim() || '';
  const assetName = String(input.assetName ?? '').trim();
  const projectId = String(input.projectId ?? '').trim();
  if (!projectId) return;

  void (async () => {
    try {
      const { data: project } = await client
        .from('projects')
        .select('project_code, project_name, period_name, hospital_unit_id')
        .eq('id', projectId)
        .maybeSingle();

      let unitCode: string | null = null;
      let unitNumber: string | null = null;
      let archetypeName: string | null = null;
      const huId = project?.hospital_unit_id ? String(project.hospital_unit_id) : '';
      if (huId) {
        const { data: unit } = await client
          .from('hospital_units_config')
          .select('code, hu_number, archetype_id')
          .eq('id', huId)
          .maybeSingle();
        unitCode = unit?.code != null ? String(unit.code) : null;
        unitNumber = unit?.hu_number != null ? String(unit.hu_number) : null;
        const archId = unit?.archetype_id ? String(unit.archetype_id) : '';
        if (archId) {
          const { data: arch } = await client
            .from('archetypes_config')
            .select('name')
            .eq('id', archId)
            .maybeSingle();
          archetypeName = arch?.name != null ? String(arch.name) : null;
        }
      }

      const body = {
        asset_code: assetCode,
        asset_name: assetName,
        project_code: project?.project_code != null ? String(project.project_code) : '',
        project_name: project?.project_name != null ? String(project.project_name) : '',
        unit_code: unitCode,
        unit_number: unitNumber,
        archetype_name: archetypeName,
        period_name: project?.period_name != null ? String(project.period_name) : '',
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(
          `[power-automate] asset webhook HTTP ${res.status} asset=${assetCode || assetName}`,
        );
      }
    } catch (err) {
      console.warn(
        '[power-automate] asset webhook failed:',
        err instanceof Error ? err.message : err,
      );
    }
  })();
}
