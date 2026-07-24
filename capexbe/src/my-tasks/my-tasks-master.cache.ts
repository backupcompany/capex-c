import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllRoles,
  getAllTasks,
  getAllWorkflowSets,
} from '../project-list/master-data.loader';

export type MyTasksMasterPayload = {
  allWorkflows: any[];
  allRoles: any[];
  allTasks: any[];
  archetypes: { id: string; name: string }[];
  hus: { id: string; name: string; archetypeId?: string; archetype_id?: string }[];
};

const MASTER_TTL_MS = 5 * 60 * 1000;
let masterCache: { expiresAt: number; payload: MyTasksMasterPayload } | null = null;

/** Shared master config — satu load per BE instance, bukan per user/request. */
export async function loadMyTasksMasterPayload(
  client: SupabaseClient,
): Promise<MyTasksMasterPayload> {
  if (masterCache && masterCache.expiresAt > Date.now()) {
    return masterCache.payload;
  }
  const [allWorkflows, allRoles, allTasks, archetypes, hus] = await Promise.all([
    getAllWorkflowSets(client),
    getAllRoles(client),
    getAllTasks(client),
    getAllArchetypesConfig(client),
    getAllHospitalUnitsConfig(client),
  ]);
  const payload: MyTasksMasterPayload = { allWorkflows, allRoles, allTasks, archetypes, hus };
  masterCache = { expiresAt: Date.now() + MASTER_TTL_MS, payload };
  return payload;
}
