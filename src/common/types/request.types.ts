import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
}
export interface ApiRequest extends Request {
  user?: AuthenticatedUser;
  requestId?: string;
}
