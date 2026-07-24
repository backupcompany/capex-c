const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const APPROVED_FS_STATUSES = new Set(['Approved', 'Approved with Notes']);

export type FsUpdateStudyRef = {
  id: string;
  conclusion: string;
  amount: number;
};

export type FsEnrichedProjectRow = Record<string, unknown> & {
  id: string;
  projectCode?: string;
  projectName: string;
  huName: string;
  archetypeName: string;
  archetypeId: string;
  axCode?: string | null;
  approvedBudget: number;
  budgetPlan: number;
  targetBudgetStart?: string | null;
  budgetRevenuePermonth?: number;
  assets: unknown[];
  fsApproval: boolean;
  assetsNotFSApprovedCount: number;
  fsStatus: string;
  fsId?: string;
};

export type FsUpdateEnrichment = {
  rows: FsEnrichedProjectRow[];
  fsByProjectId: Record<string, FsUpdateStudyRef>;
  assetFSApprovalMap: Record<string, boolean>;
};

type FsUpdateBundleInput = {
  period: any | null;
  tasks: any[];
  studies: any[];
  assetTaskStatuses: any[];
};

export function enrichFsUpdateProjects(bundle: FsUpdateBundleInput): FsUpdateEnrichment {
  const fsApprovalTask = (bundle.tasks ?? []).find(
    (t) => normalize(t.name) === 'fs approval' || t.id === 'TASK-C-06',
  );
  const fsApprovalTaskId = fsApprovalTask?.id;

  const assetFSApprovalStatusMap = new Map<string, boolean>();
  if (fsApprovalTaskId) {
    for (const status of bundle.assetTaskStatuses ?? []) {
      if (status.taskId === fsApprovalTaskId && String(status.status) === 'Done') {
        assetFSApprovalStatusMap.set(String(status.assetId), true);
      }
    }
  }

  const fsMap = new Map((bundle.studies ?? []).map((fs) => [String(fs.projectId), fs]));
  const rows: FsEnrichedProjectRow[] = [];

  for (const archetype of bundle.period?.archetypes ?? []) {
    for (const unit of archetype.units ?? []) {
      for (const project of unit.projects ?? []) {
        const assets = Array.isArray(project.assets) ? project.assets : [];
        const assetsNotFSApproved = assets.filter(
          (asset: { id?: string }) => !assetFSApprovalStatusMap.get(String(asset.id)),
        );
        const fs = fsMap.get(String(project.id));
        const axCode = project.axCode ?? project.ax_code;
        const approvedBudget = Number(project.approvedBudget ?? project.approved_budget) || 0;

        rows.push({
          ...project,
          id: String(project.id),
          huName: unit.name,
          archetypeName: archetype.name,
          archetypeId: String(archetype.id),
          assets,
          fsApproval: Boolean(String(axCode ?? '').trim()) && approvedBudget > 0,
          assetsNotFSApprovedCount: assetsNotFSApproved.length,
          fsStatus: fs ? String(fs.conclusion ?? 'Pending') : 'Not Submitted',
          fsId: fs?.id ? String(fs.id) : undefined,
        });
      }
    }
  }

  const fsByProjectId: Record<string, FsUpdateStudyRef> = {};
  for (const fs of bundle.studies ?? []) {
    fsByProjectId[String(fs.projectId)] = {
      id: String(fs.id),
      conclusion: String(fs.conclusion ?? ''),
      amount: Number(fs.amount) || 0,
    };
  }

  return {
    rows,
    fsByProjectId,
    assetFSApprovalMap: Object.fromEntries(assetFSApprovalStatusMap.entries()),
  };
}

type FsUpdatePageHydrationInput = {
  projects: Record<string, unknown>[];
  masterHus: Array<{ id: string; name: string; archetypeId?: string; archetype_id?: string }>;
  masterArchetypes: Array<{ id: string; name: string }>;
  studies: any[];
  assets: any[];
  assetTaskStatuses: any[];
  tasks: any[];
  sortBy?: 'projectCode_asc' | 'projectName_asc' | 'huName_asc' | 'budgetPlan_desc';
};

/** Enrich one DB page of projects (FS Update query path). */
export function enrichFsUpdateProjectPage(input: FsUpdatePageHydrationInput): FsEnrichedProjectRow[] {
  const huById = new Map(input.masterHus.map((h) => [String(h.id), h]));
  const archById = new Map(input.masterArchetypes.map((a) => [String(a.id), a]));

  const fsApprovalTask = (input.tasks ?? []).find(
    (t) => normalize(t.name) === 'fs approval' || t.id === 'TASK-C-06',
  );
  const fsApprovalTaskId = fsApprovalTask?.id;

  const assetFSApprovalStatusMap = new Map<string, boolean>();
  if (fsApprovalTaskId) {
    for (const status of input.assetTaskStatuses ?? []) {
      const taskId = status.taskId ?? status.task_id;
      const assetId = status.assetId ?? status.asset_id;
      if (taskId === fsApprovalTaskId && String(status.status) === 'Done') {
        assetFSApprovalStatusMap.set(String(assetId), true);
      }
    }
  }

  const assetsByProject = new Map<string, unknown[]>();
  for (const asset of input.assets ?? []) {
    const pid = String(asset.projectId ?? asset.project_id ?? '');
    if (!pid) continue;
    const list = assetsByProject.get(pid);
    if (list) list.push(asset);
    else assetsByProject.set(pid, [asset]);
  }

  const fsMap = new Map((input.studies ?? []).map((fs) => [String(fs.projectId ?? fs.project_id), fs]));
  const rows: FsEnrichedProjectRow[] = [];

  for (const raw of input.projects) {
    const projectId = String(raw.id ?? '');
    const huId = String(raw.hospital_unit_id ?? raw.hospitalUnitId ?? '');
    const hu = huById.get(huId);
    const archId = String(hu?.archetypeId ?? hu?.archetype_id ?? '');
    const arch = archById.get(archId);
    const assets = assetsByProject.get(projectId) ?? [];
    const assetsNotFSApproved = assets.filter((asset) => {
      const id = String((asset as { id?: string }).id ?? '');
      return !assetFSApprovalStatusMap.get(id);
    });
    const fs = fsMap.get(projectId);
    const axCode = raw.ax_code ?? raw.axCode;
    const approvedBudget = Number(raw.approved_budget ?? raw.approvedBudget) || 0;
    const budgetPlan = Number(raw.budget_plan ?? raw.budgetPlan) || 0;

    rows.push({
      id: projectId,
      projectCode: String(raw.project_code ?? raw.projectCode ?? ''),
      projectName: String(raw.project_name ?? raw.projectName ?? ''),
      huName: String(hu?.name ?? ''),
      archetypeName: String(arch?.name ?? ''),
      archetypeId: archId,
      axCode: axCode == null ? null : String(axCode),
      approvedBudget,
      budgetPlan,
      targetBudgetStart: (raw.target_budget_start ?? raw.targetBudgetStart) as string | null | undefined,
      budgetRevenuePermonth: Number(raw.budget_revenue_permonth ?? raw.budgetRevenuePermonth) || 0,
      assets,
      fsApproval: Boolean(String(axCode ?? '').trim()) && approvedBudget > 0,
      assetsNotFSApprovedCount: assetsNotFSApproved.length,
      fsStatus: fs ? String(fs.conclusion ?? 'Pending') : 'Not Submitted',
      fsId: fs?.id ? String(fs.id) : undefined,
    });
  }

  if (input.sortBy === 'huName_asc') {
    rows.sort((a, b) => a.huName.localeCompare(b.huName) || a.projectName.localeCompare(b.projectName));
  }

  return rows;
}

export function computeFsUpdateSummary(
  projects: FsEnrichedProjectRow[],
  fsByProjectId: Record<string, FsUpdateStudyRef>,
): {
  submittedQty: number;
  submittedAmountIdr: number;
  approvedQty: number;
  approvedAmountIdr: number;
  notApprovedQty: number;
} {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  let submittedQty = 0;
  let submittedAmountIdr = 0;
  let approvedQty = 0;
  let approvedAmountIdr = 0;

  for (const [projectId, fs] of Object.entries(fsByProjectId)) {
    const project = projectMap.get(projectId);
    if (!project) continue;

    submittedQty += 1;
    const approvedBudget = Number(project.approvedBudget) || 0;

    if (APPROVED_FS_STATUSES.has(fs.conclusion)) {
      approvedQty += 1;
      approvedAmountIdr += approvedBudget;
    } else {
      submittedAmountIdr += approvedBudget;
    }
  }

  return {
    submittedQty,
    submittedAmountIdr,
    approvedQty,
    approvedAmountIdr,
    notApprovedQty: submittedQty - approvedQty,
  };
}
