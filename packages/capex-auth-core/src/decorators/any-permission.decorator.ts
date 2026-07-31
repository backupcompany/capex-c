import { SetMetadata } from '@nestjs/common';
import type { RequiredPermission } from './permissions.decorator';

export const ANY_PERMISSION_KEY = 'any_permission';

export const RequireAnyPermission = (...checks: RequiredPermission[]) =>
  SetMetadata(ANY_PERMISSION_KEY, checks);
