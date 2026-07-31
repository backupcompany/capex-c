export const ENTERPRISE_ROLE_SLUGS = [
  'super_admin',
  'pmo',
  'manager',
  'approver',
  'user',
] as const;

export type EnterpriseRoleSlug = (typeof ENTERPRISE_ROLE_SLUGS)[number];
