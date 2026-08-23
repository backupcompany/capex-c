import {
  assignmentScopeCacheFingerprint,
  mergeServerScopeFromQuery,
  resolveProjectListFilterOpts,
} from './project-list-query.util';
import type { ProjectListQueryFilters } from './project-list.dto';

const master = {
  archetypes: [{ id: 'ARCH-A', name: 'Premium Specialist' }],
  hus: [
    { id: 'HU-A', name: 'RS Siloam A', archetypeId: 'ARCH-A' },
    { id: 'HU-B', name: 'RS Siloam B', archetypeId: 'ARCH-A' },
  ],
};

const baseFilters: ProjectListQueryFilters = {
  sortBy: 'project_code',
  search: '',
  huNames: [],
  archetypeName: null,
  assetTypeGroupName: null,
  priorityNames: [],
  budgetCategoryIds: [],
  budgetFilter: null,
  completionMin: 0,
  completionMax: 100,
  finishedTasks: [],
};

describe('cross-HU scope (project-list)', () => {
  it('assignmentScopeCacheFingerprint changes when scopes change', () => {
    const a = assignmentScopeCacheFingerprint({
      assignments: [{ roleName: 'PMO', assignedScopes: ['ARCH-01', 'HU-SHKP'] }],
    });
    const b = assignmentScopeCacheFingerprint({
      assignments: [{ roleName: 'PMO', assignedScopes: ['ARCH-01', 'HU-SHKP', 'HU-SHJR'] }],
    });
    const c = assignmentScopeCacheFingerprint({
      assignments: [{ roleName: 'PMO', assignedScopes: ['HU-SHKP', 'ARCH-01'] }],
    });
    expect(a).not.toBe(b);
    expect(a).toBe(c);
    expect(assignmentScopeCacheFingerprint(null)).toBe('none');
  });

  it('scoped user assigned HU-A only — filter HU-B → forceEmpty', () => {
    const result = resolveProjectListFilterOpts(
      { ...baseFilters, huNames: ['RS Siloam B'] },
      master,
      { scopeAll: false, scopeHuNames: ['RS Siloam A'], scopeArchetypeNames: [] },
    );
    expect(result.forceEmpty).toBe(true);
    expect(result.filterHuIds).toEqual([]);
  });

  it('scoped user assigned HU-A — filter HU-A → allowed', () => {
    const result = resolveProjectListFilterOpts(
      { ...baseFilters, huNames: ['RS Siloam A'] },
      master,
      { scopeAll: false, scopeHuNames: ['RS Siloam A'], scopeArchetypeNames: [] },
    );
    expect(result.forceEmpty).toBe(false);
  });

  it('Head Office scopeAll — any HU filter passes', () => {
    const result = resolveProjectListFilterOpts(
      { ...baseFilters, huNames: ['RS Siloam B'] },
      master,
      { scopeAll: true, scopeHuNames: [], scopeArchetypeNames: [] },
    );
    expect(result.forceEmpty).toBe(false);
  });

  it('scoped user with no HUs assigned — default list → forceEmpty', () => {
    const result = resolveProjectListFilterOpts(
      { ...baseFilters },
      master,
      { scopeAll: false, scopeHuNames: [], scopeArchetypeNames: [] },
    );
    expect(result.forceEmpty).toBe(true);
  });

  it('client scopeAll must not widen server scope', () => {
    const serverScope = {
      scopeAll: false,
      scopeHuNames: ['RS Siloam A'],
      scopeArchetypeNames: [] as string[],
    };
    mergeServerScopeFromQuery(serverScope, { scopeAll: true });
    expect(serverScope.scopeAll).toBe(false);
    expect(serverScope.scopeHuNames).toEqual(['RS Siloam A']);
  });
});
