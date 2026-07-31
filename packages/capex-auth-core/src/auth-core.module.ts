import { Global, Module } from '@nestjs/common';
import { AuthContextService } from '../../../capexbe/src/auth/auth-context.service';
import { JwtTokenService } from '../../../capexbe/src/auth/jwt-token.service';
import { SessionService } from '../../../capexbe/src/auth/session.service';
import { AuthUserResolver } from '../../../capexbe/src/auth/auth-user.resolver';
import { AuthAuditService } from '../../../capexbe/src/auth/auth-audit.service';
import { AuthRateLimiterService } from '../../../capexbe/src/auth/auth-rate-limiter.service';
import { AuthAccountLockoutService } from '../../../capexbe/src/auth/auth-account-lockout.service';
import { CsrfService } from '../../../capexbe/src/auth/csrf.service';
import { SuspiciousLoginService } from '../../../capexbe/src/auth/suspicious-login.service';
import { SupabaseJwtService } from '../../../capexbe/src/auth/supabase-jwt.service';
import { AuthZService } from '../../../capexbe/src/auth/auth-z.service';

/** Shared auth providers — services bridge from capexbe until Phase 3e full compile. */
@Global()
@Module({
  providers: [
    AuthContextService,
    AuthZService,
    JwtTokenService,
    SessionService,
    AuthUserResolver,
    AuthAuditService,
    AuthRateLimiterService,
    AuthAccountLockoutService,
    CsrfService,
    SuspiciousLoginService,
    SupabaseJwtService,
  ],
  exports: [
    AuthContextService,
    AuthZService,
    AuthUserResolver,
    JwtTokenService,
    SessionService,
    AuthAuditService,
    AuthRateLimiterService,
    AuthAccountLockoutService,
    CsrfService,
    SuspiciousLoginService,
    SupabaseJwtService,
  ],
})
export class AuthCoreModule {}
