import { privacyExportView, deletionRequestView } from './privacy.view';
import { privacyFixture } from '../../../test/helpers/privacy-fixture';
import { authPassword } from '../../../test/helpers/auth-fixture';
test('projeções resistem a campos secretos extras no snapshot e no pedido', async () => {
  const f = await privacyFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  const snapshot = await f.foundation.privacy.readExport(f.user.id, [f.dependent.id], 1000);
  const payload = privacyExportView('id', new Date(), [f.dependent.id], snapshot);
  const json = JSON.stringify(payload);
  expect(json).not.toContain(f.user.passwordHash);
  expect(json).not.toContain('credentialVersion');
  expect(json).not.toContain(session.refreshToken);
  const request = await f.foundation.privacy.createDeletionRequest({
    userId: f.user.id,
    retentionPolicy: f.config.getOrThrow('PRIVACY_RETENTION_DAYS'),
    retentionNotBeforeAt: null,
  });
  expect(Object.keys(deletionRequestView(request)).sort()).toEqual([
    'accountAccessClosed',
    'id',
    'message',
    'requestedAt',
    'retentionNotBeforeAt',
    'status',
  ]);
});
