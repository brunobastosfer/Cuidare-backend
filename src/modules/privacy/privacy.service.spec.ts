import { randomUUID } from 'node:crypto';
import { HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { privacyFixture } from '../../../test/helpers/privacy-fixture';
import { authPassword } from '../../../test/helpers/auth-fixture';
import { parseRetentionDays } from '../../config/privacy-settings';
import { MedicationsService } from '../medications/medications.service';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import { AuditService } from '../audit/audit.service';
import { treatmentDto } from '../../../test/helpers/medication-fixture';
import { AppointmentsService } from '../appointments/appointments.service';
import { appointmentDto, recommendationDto } from '../../../test/helpers/appointment-fixture';
test('consultas/recomendações têm limites por coleção e exportação sem campos técnicos', async () => {
  const f = await privacyFixture();
  const appointments = new AppointmentsService(
    f.foundation,
    new DependentAuthorizationService(f.foundation.dependentAccess),
    new AuditService(),
  );
  const a = await appointments.create(f.user.id, f.dependent.id, appointmentDto());
  const rec = await appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    a.id,
    recommendationDto({ status: 'COMPLETED' }),
  );
  const selected = await f.privacy.export(f.user.id, {
    format: 'JSON',
    password: authPassword,
    dependentIds: [f.dependent.id],
  });
  expect(selected.data.appointments[0]?.id).toBe(a.id);
  expect(selected.data.medicalRecommendations[0]?.id).toBe(rec.id);
  expect(JSON.stringify(selected)).not.toMatch(/completedAt|deletedAt/);
  const snapshot = await f.foundation.privacy.readExport(f.user.id, [f.dependent.id], 1000);
  const read = jest.spyOn(f.foundation.privacy, 'readExport');
  f.config.set('PRIVACY_EXPORT_MAX_ITEMS', 1);
  for (const collection of ['appointments', 'medicalRecommendations'] as const) {
    read.mockResolvedValue({
      ...snapshot,
      auditEvents: [],
      exportHistory: [],
      [collection]: [...snapshot[collection], ...snapshot[collection]],
    });
    await expect(
      f.privacy.export(f.user.id, {
        format: 'JSON',
        password: authPassword,
        dependentIds: [f.dependent.id],
      }),
    ).rejects.toMatchObject({ status: 413 });
  }
});
const originalEnvironment = { ...process.env };
afterEach(() => {
  for (const key of [
    'PRIVACY_RETENTION_DAYS',
    'PRIVACY_EXPORT_MAX_ITEMS',
    'PRIVACY_EXPORT_MAX_BYTES',
  ]) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
const exportDto = { format: 'JSON', password: authPassword } as const;
const deletionDto = { password: authPassword, confirmation: 'DELETE_MY_ACCOUNT' } as const;
test('exportação clínica é opt-in OWNER, mantém textos informados e respeita soft delete/limites', async () => {
  const f = await privacyFixture();
  const medications = new MedicationsService(
    f.foundation,
    new DependentAuthorizationService(f.foundation.dependentAccess),
    new AuditService(),
  );
  const product = await medications.createProduct(f.user.id, f.dependent.id, {
    name: 'Produto fictício',
  });
  const row = await medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(product.id),
  );
  const own = await f.privacy.export(f.user.id, exportDto);
  expect(own.schemaVersion).toBe('1.5');
  expect(own.data.medications).toEqual([]);
  expect(own.data.medicationTreatments).toEqual([]);
  const selected = await f.privacy.export(f.user.id, {
    ...exportDto,
    dependentIds: [f.dependent.id],
  });
  expect(selected.data.medications.map((p) => p.id)).toEqual([product.id]);
  expect(selected.data.medicationTreatments[0]).toMatchObject({
    id: row.id,
    dosage: row.dosage,
    startDate: '2026-01-01',
  });
  expect(JSON.stringify(selected)).not.toContain('completedAt');
  await medications.deleteTreatment(f.user.id, f.dependent.id, row.id);
  expect(
    (await f.privacy.export(f.user.id, { ...exportDto, dependentIds: [f.dependent.id] })).data
      .medicationTreatments,
  ).toEqual([]);
  const snapshot = await f.foundation.privacy.readExport(f.user.id, [f.dependent.id], 1000);
  jest.spyOn(f.foundation.privacy, 'readExport').mockResolvedValue({
    ...snapshot,
    auditEvents: [],
    exportHistory: [],
    medications: [product, { ...product, id: randomUUID() }],
    medicationTreatments: [],
  });
  f.config.set('PRIVACY_EXPORT_MAX_ITEMS', 1);
  await expect(
    f.privacy.export(f.user.id, { ...exportDto, dependentIds: [f.dependent.id] }),
  ).rejects.toMatchObject({ status: 413 });
});
test('exportação padrão é só a conta, sem secrets e com audit sem payload', async () => {
  const f = await privacyFixture();
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  await f.foundation.tasks.create({
    ownerId: f.user.id,
    title: 'Rotina',
    description: 'Descrição fictícia',
  });
  const payload = await f.privacy.export(f.user.id, exportDto);
  expect(payload.data.dependents).toEqual([]);
  expect(payload.data.dependentAccess).toEqual([]);
  expect(payload.data.careTasks).toHaveLength(1);
  expect(payload.data.sessions).toHaveLength(1);
  const json = JSON.stringify(payload);
  for (const privateValue of [
    f.user.passwordHash,
    session.accessToken,
    session.refreshToken,
    'credentialVersion',
    'tokenHash',
    'passwordHash',
    'createdByUserId',
    'ownerId',
    'metadata',
  ])
    expect(json).not.toContain(privateValue);
  expect(f.foundation.exportRows.size).toBe(1);
  expect(f.foundation.auditRows.at(-1)).toMatchObject({
    action: 'DATA_EXPORTED',
    metadata: {},
    resourceId: payload.exportId,
  });
});
test('seleção explícita inclui somente dependent OWNER e vínculo próprio, não outros titulares', async () => {
  const f = await privacyFixture();
  const other = await f.users.create({
    name: 'Other',
    email: 'other@example.com',
    passwordHash: 'private-other-hash',
  });
  await f.foundation.dependentAccess.create({
    userId: other.id,
    dependentId: f.dependent.id,
    role: 'OWNER',
    relationship: 'OTHER',
  });
  const payload = await f.privacy.export(f.user.id, {
    ...exportDto,
    dependentIds: [f.dependent.id],
  });
  expect(payload.data.dependents[0]?.birthDate).toBe('2020-02-29');
  expect(payload.data.dependentAccess).toHaveLength(1);
  expect(JSON.stringify(payload)).not.toContain(other.email);
  expect(JSON.stringify(payload)).not.toContain(other.id);
  for (const role of ['VIEWER', 'EDITOR'] as const) {
    const own = [...f.foundation.accessRows.values()].find((a) => a.userId === f.user.id);
    if (!own) throw new Error();
    f.foundation.accessRows.set(own.id, { ...own, role });
    await expect(
      f.privacy.export(f.user.id, { ...exportDto, dependentIds: [f.dependent.id] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  }
});
test('IDOR, vínculo revogado e dependente excluído não produzem exportação parcial', async () => {
  const f = await privacyFixture();
  await expect(
    f.privacy.export(f.user.id, { ...exportDto, dependentIds: [f.dependent.id, randomUUID()] }),
  ).rejects.toBeInstanceOf(NotFoundException);
  await f.foundation.dependentAccess.revokeAllForUser(f.user.id, new Date());
  await expect(
    f.privacy.export(f.user.id, { ...exportDto, dependentIds: [f.dependent.id] }),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(f.foundation.exportRows.size).toBe(0);
  f.foundation.dependentRows.set(f.dependent.id, { ...f.dependent, deletedAt: new Date() });
  await expect(
    f.privacy.export(f.user.id, { ...exportDto, dependentIds: [f.dependent.id] }),
  ).rejects.toBeInstanceOf(NotFoundException);
});
test('exportação excedendo quantidade ou bytes falha sem persistir conteúdo/registro', async () => {
  const f = await privacyFixture();
  f.config.set('PRIVACY_EXPORT_MAX_ITEMS', 1);
  for (let i = 0; i < 2; i++)
    await f.foundation.tasks.create({
      ownerId: f.user.id,
      title: 'Rotina',
      description: 'Descrição',
    });
  await expect(f.privacy.export(f.user.id, exportDto)).rejects.toBeInstanceOf(HttpException);
  f.config.set('PRIVACY_EXPORT_MAX_ITEMS', 1000);
  f.config.set('PRIVACY_EXPORT_MAX_BYTES', 1);
  await expect(f.privacy.export(f.user.id, exportDto)).rejects.toBeInstanceOf(HttpException);
  expect(f.foundation.exportRows.size).toBe(0);
});
test('falha de audit desfaz o recibo de exportação e nunca retorna conteúdo', async () => {
  const f = await privacyFixture();
  jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValueOnce(new Error('audit'));
  await expect(f.privacy.export(f.user.id, exportDto)).rejects.toThrow();
  expect(f.foundation.exportRows.size).toBe(0);
});
test('exclusão fecha conta/sessões/códigos/vínculos atomicamente, preservando dependentes compartilhados', async () => {
  const f = await privacyFixture();
  const other = await f.users.create({
    name: 'Other',
    email: 'other@example.com',
    passwordHash: 'fixture',
  });
  await f.foundation.dependentAccess.create({
    userId: other.id,
    dependentId: f.dependent.id,
    role: 'OWNER',
    relationship: null,
  });
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  await f.account.request('PASSWORD_RESET', f.user.email, 'ip');
  const receipt = await f.privacy.requestDeletion(f.user.id, deletionDto);
  expect(receipt).toMatchObject({ status: 'PENDING_REVIEW', retentionNotBeforeAt: null });
  expect(await f.users.findById(f.user.id)).toBeNull();
  expect(f.users.rows.get(f.user.email)).toMatchObject({
    status: 'BLOCKED',
    credentialVersion: 1,
    deletedAt: expect.any(Date) as Date,
  });
  await expect(f.auth.refresh(session.refreshToken)).rejects.toThrow();
  expect([...f.foundation.auth.tokenRows.values()].every((t) => t.revokedAt !== null)).toBe(true);
  expect(f.foundation.dependentRows.get(f.dependent.id)?.deletedAt).toBeNull();
  expect(await f.foundation.dependentAccess.findActive(other.id, f.dependent.id)).not.toBeNull();
  expect(f.foundation.consentRows.size).toBe(0);
  expect(f.foundation.auditRows.at(-1)).toMatchObject({
    action: 'ACCOUNT_DELETION_REQUESTED',
    metadata: {},
  });
});
test('prazo configurado é limite de revisão, não execução automática de purge', async () => {
  const f = await privacyFixture();
  f.config.set('PRIVACY_RETENTION_DAYS', parseRetentionDays('{"ACCOUNT":7,"AUDIT":30}'));
  const before = Date.now();
  const receipt = await f.privacy.requestDeletion(f.user.id, deletionDto);
  expect(receipt.retentionNotBeforeAt?.getTime()).toBeGreaterThanOrEqual(before + 7 * 86400000);
  expect(receipt.retentionPolicy).toMatchObject({ ACCOUNT: 7, AUDIT: 30, DEPENDENT: null });
  expect(f.users.rows.has(f.user.email)).toBe(true);
});
test('senha inválida impede exportação/exclusão; falha do audit desfaz fechamento e recibo', async () => {
  const f = await privacyFixture();
  for (const action of [
    () => f.privacy.export(f.user.id, { ...exportDto, password: 'wrong' }),
    () => f.privacy.requestDeletion(f.user.id, { ...deletionDto, password: 'wrong' }),
  ])
    await expect(action()).rejects.toBeInstanceOf(UnauthorizedException);
  const session = await f.auth.login({ email: f.user.email, password: authPassword }, 'ip');
  jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValueOnce(new Error('audit'));
  await expect(f.privacy.requestDeletion(f.user.id, deletionDto)).rejects.toThrow();
  expect(await f.users.findById(f.user.id)).not.toBeNull();
  expect(f.foundation.deletionRows.size).toBe(0);
  expect(await f.auth.refresh(session.refreshToken)).toBeDefined();
  expect(await f.foundation.dependentAccess.findActive(f.user.id, f.dependent.id)).not.toBeNull();
});
test('reset concorrente após prova da senha antiga impede exportação e fechamento', async () => {
  for (const operation of ['export', 'delete'] as const) {
    const f = await privacyFixture();
    const verify = f.passwords.verify.bind(f.passwords);
    jest.spyOn(f.passwords, 'verify').mockImplementationOnce(async (...args) => {
      const valid = await verify(...args);
      await f.users.resetPassword(f.user.id, 0, 'new-hash');
      return valid;
    });
    const promise =
      operation === 'export'
        ? f.privacy.export(f.user.id, exportDto)
        : f.privacy.requestDeletion(f.user.id, deletionDto);
    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    expect(f.foundation.deletionRows.size + f.foundation.exportRows.size).toBe(0);
  }
});
test('fechamentos concorrentes produzem um único recibo, sem apagar dados físicos', async () => {
  const f = await privacyFixture();
  const results = await Promise.allSettled([
    f.privacy.requestDeletion(f.user.id, deletionDto),
    f.privacy.requestDeletion(f.user.id, deletionDto),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(f.foundation.deletionRows.size).toBe(1);
  expect(f.foundation.dependentRows.size).toBe(1);
});
