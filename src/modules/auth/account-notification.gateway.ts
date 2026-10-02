import type { AccountTokenPurpose } from '../../domain/models/auth-session.model';
export const ACCOUNT_NOTIFICATION_GATEWAY = Symbol('ACCOUNT_NOTIFICATION_GATEWAY');
export interface AccountNotification {
  recipient: string;
  purpose: AccountTokenPurpose | 'PASSWORD_CHANGED';
  token?: string;
}
export interface AccountNotificationGateway {
  isAvailable(): boolean;
  // Assíncrono: latência de SMTP não deve revelar se o email está cadastrado.
  enqueue(notification: AccountNotification): void;
}
