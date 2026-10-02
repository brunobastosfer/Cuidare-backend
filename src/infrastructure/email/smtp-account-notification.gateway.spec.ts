import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { SmtpAccountNotificationGateway } from './smtp-account-notification.gateway';
const smtp = {
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  EMAIL_FROM: 'sender@example.com',
  SMTP_PORT: 465,
  SMTP_SECURE: 'true',
};
test('SMTP desativado não entrega nem cria transporte', async () => {
  const gateway = new SmtpAccountNotificationGateway(
    new ConfigService({ EMAIL_TRANSPORT: 'disabled' }),
  );
  const create = jest.spyOn(nodemailer, 'createTransport');
  gateway.enqueue({
    recipient: 'person@example.com',
    purpose: 'EMAIL_VERIFICATION',
    token: 'fixture-token',
  });
  await gateway.onModuleDestroy();
  expect(create).not.toHaveBeenCalled();
});
test('SMTP exige TLS/certificado e não registra erro/token; entrega é assíncrona', async () => {
  const sendMail = jest.fn().mockRejectedValue(new Error('secret-token SMTP password'));
  const close = jest.fn();
  const create = jest
    .spyOn(nodemailer, 'createTransport')
    .mockReturnValue({ sendMail, close } as unknown as ReturnType<
      typeof nodemailer.createTransport
    >);
  const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const gateway = new SmtpAccountNotificationGateway(new ConfigService(smtp));
  gateway.enqueue({
    recipient: 'person@example.com',
    purpose: 'PASSWORD_RESET',
    token: 'secret-token',
  });
  expect(sendMail).not.toHaveBeenCalled();
  await gateway.onModuleDestroy();
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      requireTLS: true,
      ignoreTLS: false,
      logger: false,
      debug: false,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: 'smtp.example.com' },
    }),
  );
  expect(log).toHaveBeenCalledWith({ event: 'account_notification_failed' });
  expect(close).toHaveBeenCalled();
});
