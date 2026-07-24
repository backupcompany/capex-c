import { z } from 'zod';
import type { UserTask } from '@/types';

const stringArraySchema = z.array(z.string());

export type MyTasksFilterOptionsParsed = {
  archetypeNames: string[];
  huNames: string[];
  assignedRoleNames: string[];
};

export type MyTasksPageResponseParsed = {
  tasks: UserTask[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: MyTasksFilterOptionsParsed;
};

export const myTasksFilterOptionsSchema = z.object({
  archetypeNames: stringArraySchema.catch([]),
  huNames: stringArraySchema.catch([]),
  assignedRoleNames: stringArraySchema.catch([]),
});

const userRoleSchema = z
  .object({
    id: z.coerce.number(),
    roleName: z.string(),
  })
  .passthrough();

/** Minimal task row — drops corrupt rows instead of blanking the whole page. */
export const userTaskSchema = z
  .object({
    type: z.enum(['workflow', 'adhoc']),
    id: z.string().min(1),
    taskName: z.string().catch(''),
    description: z.string().catch(''),
    assetId: z.string().catch(''),
    assetCode: z.string().catch(''),
    assetName: z.string().catch(''),
    projectCode: z.string().catch(''),
    projectName: z.string().catch(''),
    huName: z.string().catch(''),
    archetypeName: z.string().catch(''),
    startDate: z.string().catch(''),
    targetEndDate: z.string().catch(''),
    status: z.string().catch('Open'),
    workflowStep: z.object({}).passthrough().optional(),
    assignedRoles: z.array(userRoleSchema).optional(),
    isMine: z.boolean().optional(),
    completedByUserId: z.coerce.number().nullable().optional(),
    adhocTask: z.object({}).passthrough().optional(),
  })
  .passthrough();

function parseUserTasks(raw: unknown): UserTask[] {
  if (!Array.isArray(raw)) return [];
  const tasks: UserTask[] = [];
  let dropped = 0;
  for (const row of raw) {
    const parsed = userTaskSchema.safeParse(row);
    if (parsed.success) {
      tasks.push(parsed.data as UserTask);
    } else {
      dropped += 1;
    }
  }
  if (dropped > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(`[api-validation] my-tasks/tasks: dropped ${dropped} invalid row(s)`);
  }
  return tasks;
}

export const myTasksPageResponseSchema = z
  .object({
    tasks: z.unknown(),
    totalCount: z.coerce.number().int().min(0).catch(0),
    page: z.coerce.number().int().min(1).catch(1),
    pageSize: z.coerce.number().int().min(1).catch(20),
    totalPages: z.coerce.number().int().min(1).catch(1),
    filterOptions: myTasksFilterOptionsSchema.catch({
      archetypeNames: [],
      huNames: [],
      assignedRoleNames: [],
    }),
  })
  .transform((page): MyTasksPageResponseParsed => ({
    tasks: parseUserTasks(page.tasks),
    totalCount: page.totalCount,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    filterOptions: page.filterOptions as MyTasksFilterOptionsParsed,
  }));

export const myTasksOpenResponseSchema = z
  .object({
    tasks: z.unknown(),
  })
  .transform((payload) => ({
    tasks: parseUserTasks(payload.tasks),
  }));

export const EMPTY_MY_TASKS_PAGE: MyTasksPageResponseParsed = {
  tasks: [],
  totalCount: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  filterOptions: {
    archetypeNames: [],
    huNames: [],
    assignedRoleNames: [],
  },
};

export type ParsedUserTask = z.infer<typeof userTaskSchema>;
