import { sanitizeRolesForViewer } from './bootstrap-sanitize.util';

describe('sanitizeRolesForViewer', () => {
  const roles = [
    {
      id: 1,
      roleName: 'Viewer',
      permissions: [{ hierarchy: 'Budget HU', permission: 'View Only' }],
    },
    {
      id: 2,
      roleName: 'Super Admin',
      permissions: [{ hierarchy: 'Dashboard', permission: 'View, Update, Create & Delete' }],
    },
  ];

  it('keeps Viewer permissions by roleName', () => {
    const out = sanitizeRolesForViewer(roles, [{ roleName: 'Viewer' }]);
    expect(out[0].permissions).toHaveLength(1);
    expect(out[1].permissions).toEqual([]);
  });

  it('keeps Viewer permissions by roleId when name casing differs', () => {
    const out = sanitizeRolesForViewer(roles, [{ roleId: 1, roleName: 'viewer' }]);
    expect(out[0].permissions).toHaveLength(1);
    expect(out[1].permissions).toEqual([]);
  });

  it('strips all when assignment empty', () => {
    const out = sanitizeRolesForViewer(roles, []);
    expect(out.every((r) => (r.permissions?.length ?? 0) === 0)).toBe(true);
  });
});
