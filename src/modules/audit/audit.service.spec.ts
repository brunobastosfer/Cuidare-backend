import { randomUUID } from 'node:crypto';
import { AuditService } from './audit.service';
import type { CreateAuditLog } from '../../domain/models/audit-log.model';
import {
  AUDITED_APPOINTMENT_FIELDS,
  AUDITED_RECOMMENDATION_FIELDS,
  AUDITED_VACCINATION_FIELDS,
} from '../../domain/models/audit-log.model';

const valid: CreateAuditLog = {
  actorId: randomUUID(),
  action: 'DEPENDENT_UPDATED',
  resourceType: 'DEPENDENT',
  resourceId: randomUUID(),
  dependentId: randomUUID(),
  metadata: { changedFields: ['fullName'] },
};
test.each(['SCHOOL_ENROLLMENT', 'SCHOOL_REPORT'] as const)(
  'auditoria %s aceita nomes, não conteúdo nem outro recurso',
  async (resourceType) => {
    const audit = new AuditService(),
      append = jest.fn<Promise<void>, [CreateAuditLog]>().mockResolvedValue(undefined);
    const event: CreateAuditLog = {
      ...valid,
      resourceType,
      action:
        resourceType === 'SCHOOL_ENROLLMENT'
          ? 'SCHOOL_ENROLLMENT_UPDATED'
          : 'SCHOOL_REPORT_UPDATED',
      metadata: {
        changedFields:
          resourceType === 'SCHOOL_ENROLLMENT'
            ? ['schoolName', 'schoolYear', 'grade', 'className', 'startDate', 'endDate']
            : ['enrollmentId', 'title', 'reportDate', 'summary', 'observations', 'documentId'],
      },
    };
    await audit.record({ append }, event);
    for (const bad of [
      { ...event, resourceType: 'DOCUMENT' },
      { ...event, metadata: { summary: 'Private' } },
      { ...event, metadata: { changedFields: ['createdByUserId'] } },
      {
        ...event,
        metadata: {
          changedFields: [resourceType === 'SCHOOL_ENROLLMENT' ? 'summary' : 'schoolName'],
        },
      },
    ])
      expect(() => audit.record({ append }, bad as CreateAuditLog)).toThrow();
    expect(append).toHaveBeenCalledTimes(1);
  },
);
test('vacinação aceita somente campos editáveis e o recurso específico; nunca valores clínicos', async () => {
  const audit = new AuditService(),
    append = jest.fn<Promise<void>, [CreateAuditLog]>().mockResolvedValue(undefined);
  const event: CreateAuditLog = {
    ...valid,
    action: 'VACCINATION_UPDATED',
    resourceType: 'DEPENDENT_VACCINATION',
    metadata: { changedFields: [...AUDITED_VACCINATION_FIELDS] },
  };
  await audit.record({ append }, event);
  expect(append).toHaveBeenCalledWith(event);
  expect(() => audit.record({ append }, { ...event, resourceType: 'DOCUMENT' })).toThrow();
  for (const metadata of [
    { changedFields: ['vaccineId'] },
    { changedFields: ['createdByUserId'] },
    { notes: 'Private medical value' },
    { sourceVersion: 'private' },
  ])
    expect(() =>
      audit.record({ append }, { ...event, metadata } as unknown as CreateAuditLog),
    ).toThrow();
  expect(append).toHaveBeenCalledTimes(1);
});
test('consultas/recomendações auditam somente nomes permitidos no recurso correto', async () => {
  const append = jest.fn<Promise<void>, [CreateAuditLog]>().mockResolvedValue(undefined);
  const audit = new AuditService();
  await audit.record(
    { append },
    {
      ...valid,
      action: 'APPOINTMENT_UPDATED',
      resourceType: 'APPOINTMENT',
      metadata: { changedFields: [...AUDITED_APPOINTMENT_FIELDS] },
    },
  );
  await audit.record(
    { append },
    {
      ...valid,
      action: 'MEDICAL_RECOMMENDATION_UPDATED',
      resourceType: 'MEDICAL_RECOMMENDATION',
      metadata: { changedFields: [...AUDITED_RECOMMENDATION_FIELDS] },
    },
  );
  expect(() =>
    audit.record(
      { append },
      {
        ...valid,
        action: 'APPOINTMENT_UPDATED',
        resourceType: 'MEDICAL_RECOMMENDATION',
        metadata: {},
      },
    ),
  ).toThrow();
  expect(() =>
    audit.record(
      { append },
      {
        ...valid,
        action: 'MEDICAL_RECOMMENDATION_UPDATED',
        resourceType: 'APPOINTMENT',
        metadata: {},
      },
    ),
  ).toThrow();
  expect(() =>
    audit.record(
      { append },
      {
        ...valid,
        action: 'APPOINTMENT_UPDATED',
        resourceType: 'APPOINTMENT',
        metadata: { changedFields: ['title'] },
      },
    ),
  ).toThrow();
});
test('anexa somente IDs, ação e nomes de campos permitidos', async () => {
  const append = jest.fn<Promise<void>, [CreateAuditLog]>().mockResolvedValue(undefined);
  await new AuditService().record({ append }, valid);
  expect(append).toHaveBeenCalledWith(valid);
});
test('documentos auditam nomes de metadata editável, não storage, bytes ou valores', async () => {
  const append = jest.fn<Promise<void>, [CreateAuditLog]>().mockResolvedValue(undefined),
    audit = new AuditService();
  await audit.record(
    { append },
    {
      ...valid,
      action: 'DOCUMENT_UPDATED',
      resourceType: 'DOCUMENT',
      metadata: { changedFields: ['category', 'title', 'description', 'documentDate'] },
    },
  );
  expect(append).toHaveBeenCalledTimes(1);
  for (const field of ['storageKey', 'checksum', 'originalFileName', 'scannedAt'])
    expect(() =>
      audit.record({ append }, {
        ...valid,
        action: 'DOCUMENT_UPDATED',
        resourceType: 'DOCUMENT',
        metadata: { changedFields: [field] },
      } as unknown as CreateAuditLog),
    ).toThrow();
  expect(() =>
    audit.record(
      { append },
      { ...valid, action: 'DOCUMENT_DOWNLOADED', resourceType: 'APPOINTMENT', metadata: {} },
    ),
  ).toThrow();
});
test.each([
  { password: 'secret' },
  { fullName: 'Sensitive name' },
  { changedFields: ['passwordHash'] },
  { changedFields: ['notes'] },
])('rejeita metadata fora da allowlist %j', (metadata) => {
  const append = jest.fn<Promise<void>, [CreateAuditLog]>();
  expect(() =>
    new AuditService().record({ append }, { ...valid, metadata } as unknown as CreateAuditLog),
  ).toThrow();
  expect(append).not.toHaveBeenCalled();
});
test('audit clínico registra somente nomes de campos no recurso correto', async () => {
  const append = jest.fn<Promise<void>, [CreateAuditLog]>().mockResolvedValue(undefined);
  const event: CreateAuditLog = {
    ...valid,
    action: 'MEDICATION_TREATMENT_UPDATED',
    resourceType: 'MEDICATION_TREATMENT',
    metadata: { changedFields: ['dosage', 'notes', 'status'] },
  };
  await new AuditService().record({ append }, event);
  expect(append).toHaveBeenCalledWith(event);
  expect(() =>
    new AuditService().record({ append }, { ...event, resourceType: 'MEDICATION' }),
  ).toThrow();
});
