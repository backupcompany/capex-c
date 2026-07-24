import { paginateMyTasks } from './my-tasks-query';

const sample = [
  {
    id: '1',
    taskName: 'Alpha',
    projectName: 'P1',
    assetName: 'A1',
    huName: 'HU-A',
    archetypeName: 'Arch-A',
    startDate: '2026-01-01',
    targetEndDate: '2026-02-01',
    status: 'Open',
    isMine: true,
    assignedRoles: [{ roleName: 'BDD' }],
  },
  {
    id: '2',
    taskName: 'Beta',
    projectName: 'P2',
    assetName: 'A2',
    huName: 'HU-B',
    archetypeName: 'Arch-B',
    startDate: '2026-01-02',
    targetEndDate: '2026-03-01',
    status: 'Open',
    isMine: false,
    assignedRoles: [{ roleName: 'PMO' }],
  },
  {
    id: '3',
    taskName: 'Gamma',
    projectName: 'P3',
    assetName: 'A3',
    huName: 'HU-A',
    archetypeName: 'Arch-A',
    startDate: '2026-01-03',
    targetEndDate: '2026-01-15',
    status: 'Done',
    isMine: true,
    assignedRoles: [{ roleName: 'BDD' }],
  },
];

describe('paginateMyTasks', () => {
  it('returns only isMine tasks in my_tasks_only mode', () => {
    const result = paginateMyTasks(sample, {
      taskViewMode: 'my_tasks_only',
      pageSize: 50,
      showCompleted: true,
    });
    expect(result.totalCount).toBe(2);
    expect(result.tasks.every((t) => t.isMine === true)).toBe(true);
  });

  it('paginates after filters', () => {
    const result = paginateMyTasks(sample, {
      taskViewMode: 'all_users',
      page: 1,
      pageSize: 1,
      showCompleted: false,
    });
    expect(result.totalCount).toBe(2);
    expect(result.tasks).toHaveLength(1);
    expect(result.totalPages).toBe(2);
  });

  it('filters by search term', () => {
    const result = paginateMyTasks(sample, { search: 'beta', taskViewMode: 'all_users' });
    expect(result.totalCount).toBe(1);
    expect(result.tasks[0].id).toBe('2');
  });
});
