import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type {
  AccountNotification,
  AccountNotificationGateway,
} from '../../modules/auth/account-notification.gateway';
@Injectable()
export class SmtpAccountNotificationGateway implements AccountNotificationGateway, OnModuleDestroy {
  private readonly logger = new Logger(SmtpAccountNotificationGateway.name);
  private transport: Transporter<SMTPTransport.SentMessageInfo> | undefined;
  private readonly pending = new Set<Promise<void>>();
  private closing = false;
  constructor(private readonly config: ConfigService) {}
  isAvailable() {
    return !this.closing && this.config.getOrThrow<string>('EMAIL_TRANSPORT') === 'smtp';
  }
  enqueue(notification: AccountNotification) {
    if (!this.isAvailable()) return;
    if (this.pending.size >= 25) {
      this.logger.warn({ event: 'account_notification_capacity' });
      return;
    }
    const job = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        if (!this.transport) {
          const host = this.config.getOrThrow<string>('SMTP_HOST');
          const user = this.config.get<string>('SMTP_USER');
          this.transport = nodemailer.createTransport({
            host,
            port: this.config.getOrThrow<number>('SMTP_PORT'),
            secure: this.config.getOrThrow<string>('SMTP_SECURE') === 'true',
            requireTLS: true,
            ignoreTLS: false,
            logger: false,
            debug: false,
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 10000,
            tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: host },
            ...(user
              ? { auth: { user, pass: this.config.getOrThrow<string>('SMTP_PASSWORD') } }
              : {}),
          });
        }
        const reset = notification.purpose === 'PASSWORD_RESET';
        const changed = notification.purpose === 'PASSWORD_CHANGED';
        await this.transport.sendMail({
          from: this.config.getOrThrow<string>('EMAIL_FROM'),
          to: notification.recipient,
          subject: changed
            ? 'Cuidarê — senha alterada'
            : reset
              ? 'Cuidarê — recuperação de senha'
              : 'Cuidarê — confirmação de email',
          text: changed
            ? 'Sua senha foi alterada. Se não reconhece esta operação, utilize a recuperação de conta pelo aplicativo.'
            : 'Use este código somente no Cuidarê para ' +
              (reset ? 'definir uma nova senha' : 'confirmar seu email') +
              ':\n' +
              (notification.token ?? '') +
              '\nNão compartilhe. Se não solicitou, ignore a mensagem.',
          disableFileAccess: true,
          disableUrlAccess: true,
        });
      })
      .catch(() => {
        this.logger.error({ event: 'account_notification_failed' });
      });
    this.pending.add(job);
    void job.finally(() => this.pending.delete(job));
  }
  async onModuleDestroy() {
    this.closing = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(this.pending),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 5000);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    this.transport?.close();
  }
}
