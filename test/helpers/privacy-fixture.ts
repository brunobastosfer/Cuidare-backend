import { authFixture } from './auth-fixture';
import { PrivacyService } from '../../src/modules/privacy/privacy.service';
import { JsonPrivacyExportFormatter } from '../../src/modules/privacy/json-privacy-export.formatter';
import { AuditService } from '../../src/modules/audit/audit.service';
export async function privacyFixture() {
  const f = await authFixture();
  const privacy = new PrivacyService(
    f.foundation,
    f.users,
    f.passwords,
    f.config,
    new AuditService(),
    new JsonPrivacyExportFormatter(),
  );
  const dependent = await f.foundation.dependents.create({
    fullName: 'Criança fictícia',
    preferredName: null,
    birthDate: new Date('2020-02-29'),
    createdByUserId: f.user.id,
  });
  await f.foundation.dependentAccess.create({
    userId: f.user.id,
    dependentId: dependent.id,
    role: 'OWNER',
    relationship: 'PARENT',
  });
  return { ...f, privacy, dependent };
}
