import { RequireAnyPermission } from './decorators/any-permission.decorator';

/** Mirrors FE pagePermissions — screen + data-operation hierarchies (OR). */
export const BUDGET_STACK_VIEW_HIERARCHIES = [
  'Budget HU',
  'HU',
  'Budget Period',
  'Budget Archetype',
  'Archetype',
  'Budget',
  'Multi-Year Budget',
] as const;

export const BUDGET_STACK_UPDATE_HIERARCHIES = [
  'Budget HU',
  'HU',
  'Budget Period',
  'Budget Archetype',
  'Archetype',
  'Budget',
  'Multi-Year Budget',
] as const;

export const BUDGET_STACK_CREATE_HIERARCHIES = [
  'Budget HU',
  'HU',
  'Budget Period',
  'Budget Archetype',
  'Archetype',
  'Budget',
  'Multi-Year Budget',
] as const;

export const BUDGET_STACK_VIEW = RequireAnyPermission(
  ...BUDGET_STACK_VIEW_HIERARCHIES.map((hierarchy) => ({
    hierarchy,
    level: 'view' as const,
  })),
);

export const BUDGET_STACK_UPDATE = RequireAnyPermission(
  ...BUDGET_STACK_UPDATE_HIERARCHIES.map((hierarchy) => ({
    hierarchy,
    level: 'update' as const,
  })),
);

export const BUDGET_STACK_CREATE = RequireAnyPermission(
  ...BUDGET_STACK_CREATE_HIERARCHIES.map((hierarchy) => ({
    hierarchy,
    level: 'create' as const,
  })),
);
