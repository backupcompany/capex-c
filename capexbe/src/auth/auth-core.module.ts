import { Global, Module } from '@nestjs/common';
import { AuthContextService } from './auth-context.service';
import { JwtTokenService } from './jwt-token.service';
import { SessionService } from './session.service';
import { AuthUserResolver } from './auth-user.resolver';
import { AuthAuditService } from './auth-audit.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { AuthAccountLockoutService } from './auth-account-lockout.service';
import { CsrfService } from './csrf.service';
import { SuspiciousLoginService } from './suspicious-login.service';
import { SupabaseJwtService } from './supabase-jwt.service';
import { AuthZService } from './auth-z.service';

/** Shared auth providers — no HTTP routes, no guards (APP_GUARD registers those in AppModule). */
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
  ],
})
export class AuthCoreModule {}
