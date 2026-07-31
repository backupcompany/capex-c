import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ResolvedAuthContext } from '../types/resolved-auth-context';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedAuthContext | undefined => {
    const req = ctx.switchToHttp().getRequest<{ authContext?: ResolvedAuthContext }>();
    return req.authContext;
  },
);

/** @alias CurrentAuth */
export const CurrentUser = CurrentAuth;
