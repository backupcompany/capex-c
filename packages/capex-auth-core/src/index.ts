/**
 * @capex/auth-core — public API for monolith + leaf services.
 * Phase 3d: AuthCoreModule + guards + utils in package; services bridge from capexbe.
 */
export { AuthCoreModule } from './auth-core.module';

export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { RolesGuard } from './guards/roles.guard';
export { PermissionsGuard } from './guards/permissions.guard';

export { Public, IS_PUBLIC_KEY } from './decorators/public.decorator';
export {
  RequirePermission,
  PERMISSION_KEY,
  type RequiredPermission,
} from './decorators/permissions.decorator';
export { RequireAnyPermission, ANY_PERMISSION_KEY } from './decorators/any-permission.decorator';
export { Roles, ROLES_KEY } from './decorators/roles.decorator';
export { CurrentAuth, CurrentUser } from './decorators/current-user.decorator';

export { AuthContextService } from '../../../capexbe/src/auth/auth-context.service';
export { AuthZService } from '../../../capexbe/src/auth/auth-z.service';
export { JwtTokenService } from '../../../capexbe/src/auth/jwt-token.service';
export {
  getAccessTokenFromRequest,
  requireAccessTokenFromRequest,
  parseBodyUserId,
} from './utils/request-access-token.util';
export { authRequestContext, getAuthRequestContext } from './auth-request-context';
export { isSuperAdminRole, ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, CSRF_HEADER } from './constants/auth-policy';

export { ENTERPRISE_ROLE_SLUGS } from './constants/enterprise-roles';
export type { EnterpriseRoleSlug } from './constants/enterprise-roles';
export type { ResolvedAuthContext } from './types/resolved-auth-context';
