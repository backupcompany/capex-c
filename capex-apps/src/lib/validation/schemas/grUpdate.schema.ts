import { z } from 'zod';
import type {
  ArchetypeConfig,
  AssetTaskStatus,
  EnrichedAsset,
  HospitalUnitConfig,
  Project,
  ProjectPriorityConfig,
  Task,
  TaskLog,
} from '@/types';

/** Asset row must at least have id + projectId; extra fields pass through. */
const grAssetRowSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
  })
  .passthrough();

const idRowSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

const idNameRowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().catch(''),
  })
  .passthrough();

const statusRowSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    taskId: z.string().min(1),
  })
  .passthrough();

const taskLogRowSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
  })
  .passthrough();

function parseObjectArray<T>(raw: unknown, rowSchema: z.ZodTypeAny, label: string): T[] {
  if (!Array.isArray(raw)) return [];
  const rows: T[] = [];
  let dropped = 0;
  for (const row of raw) {
    const parsed = rowSchema.safeParse(row);
    if (parsed.success) {
      rows.push(parsed.data as T);
    } else {
      dropped += 1;
    }
  }
  if (dropped > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(`[api-validation] gr-update/${label}: dropped ${dropped} invalid row(s)`);
  }
  return rows;
}

export type GrUpdateBundleParsed = {
  assets: EnrichedAsset[];
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  projects: Project[];
  priorities: ProjectPriorityConfig[];
  statuses: AssetTaskStatus[];
  tasks: Task[];
  taskLogs: TaskLog[];
};

export const grUpdateBundleSchema = z
  .object({
    assets: z.unknown(),
    archetypes: z.unknown(),
    hus: z.unknown(),
    projects: z.unknown(),
    priorities: z.unknown(),
    statuses: z.unknown(),
    tasks: z.unknown(),
    taskLogs: z.unknown(),
  })
  .transform((payload): GrUpdateBundleParsed => ({
    assets: parseObjectArray<EnrichedAsset>(payload.assets, grAssetRowSchema, 'assets'),
    archetypes: parseObjectArray<ArchetypeConfig>(payload.archetypes, idNameRowSchema, 'archetypes'),
    hus: parseObjectArray<HospitalUnitConfig>(payload.hus, idNameRowSchema, 'hus'),
    projects: parseObjectArray<Project>(payload.projects, idRowSchema, 'projects'),
    priorities: parseObjectArray<ProjectPriorityConfig>(payload.priorities, idNameRowSchema, 'priorities'),
    statuses: parseObjectArray<AssetTaskStatus>(payload.statuses, statusRowSchema, 'statuses'),
    tasks: parseObjectArray<Task>(payload.tasks, idNameRowSchema, 'tasks'),
    taskLogs: parseObjectArray<TaskLog>(payload.taskLogs, taskLogRowSchema, 'taskLogs'),
  }));

export const EMPTY_GR_UPDATE_BUNDLE: GrUpdateBundleParsed = {
  assets: [],
  archetypes: [],
  hus: [],
  projects: [],
  priorities: [],
  statuses: [],
  tasks: [],
  taskLogs: [],
};
