import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ApiRequest } from '../types/request.types';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<ApiRequest>().user;
  if (!user) throw new UnauthorizedException('Autenticação necessária.');
  return user;
});
