import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { getAuthRequestContext } from '../auth-request-context';
import type { ResolvedAuthContext } from '../auth.types';

/**
 * After JwtAuthGuard: bind JWT caller → `body.userId` for legacy services.
 * Wire bodies must not carry numeric userId; identity comes from the access token.
 */
@Injectable()
export class PublicUserIdBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<
      Request & { authContext?: ResolvedAuthContext }
    >();
    const body = req.body;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const ctx = req.authContext ?? getAuthRequestContext();
      if (ctx?.userId) {
        (body as Record<string, unknown>).userId = ctx.userId;
      }
    }
    return next.handle();
  }
}
