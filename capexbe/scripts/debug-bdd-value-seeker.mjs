import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { parseProjectListQueryBody } from '../dist/project-list/project-list.dto.js';

dotenv.config();

async function main() {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const query = parseProjectListQueryBody({
    userId: 148,
    periodName: '2026',
    page: 1,
    pageSize: 25,
    bddConstructionOnly: true,
    archetypeName: 'Value Seeker',
    hideUnassignedBdd: false,
    scopeAll: true,
    sortBy: 'assetCode_asc',
    search: '',
    huNames: [],
    priorityNames: [],
    budgetCategoryIds: [],
    completionMin: 0,
    completionMax: 100,
    finishedTasks: [],
  });
  console.log('query archetype', query.archetypeName);

  const { loadProjectListQueryPage } = await import('../dist/project-list/project-list-assets-query.loader.js');
  const masterLoader = await import('../dist/project-list/master-data.loader.js');

  const master = {
    workflows: await masterLoader.getAllWorkflowSets(client),
    archetypes: await masterLoader.getAllArchetypesConfig(client),
    hus: await masterLoader.getHospitalUnitsConfigSlim(client),
    prioritiesConfig: await masterLoader.getProjectPrioritiesSlim(client),
    allTasks: await masterLoader.getTasksIdNameOnly(client),
    users: [],
  };

  const result = await loadProjectListQueryPage(client, query, master);
  console.log('totalCount', result.totalCount);
  console.log('returned', result.rawEnrichedAssets.length);
  console.log('debug', result.debug);
  if (result.rawEnrichedAssets[0]) {
    console.log('first', result.rawEnrichedAssets[0].assetName, result.rawEnrichedAssets[0].archetypeName);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
