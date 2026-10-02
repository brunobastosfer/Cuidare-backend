import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import {
  PrismaMedicationRepository,
  productScope,
  treatmentScope,
  civilTimelineWhere,
} from './prisma-medication.repository';
import { treatmentDto } from '../../../test/helpers/medication-fixture';
import type { CreateMedicationTreatment } from '../../domain/models/medication.model';
import type { TimelineSourceQuery } from '../timeline-source.repository';
function setup() {
  const delegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'created' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    updateManyAndReturn: jest.fn().mockResolvedValue([]),
  });
  const db = { medication: delegate(), medicationTreatment: delegate() };
  return {
    db,
    repository: new PrismaMedicationRepository(db as unknown as Prisma.TransactionClient),
  };
}
const query: TimelineSourceQuery = {
  userId: 'actor',
  dependentId: 'child',
  from: null,
  to: null,
  type: null,
  order: 'asc',
  snapshotAt: new Date(),
  after: null,
  take: 3,
};
test('queries incluem relação de acesso ativa/conta ativa, dependentId e soft delete de produto/tratamento', async () => {
  const { db, repository } = setup();
  await repository.listProducts('child', 'actor', { limit: 10, offset: 2 });
  expect(db.medication.findMany).toHaveBeenCalledWith({
    where: productScope('child', 'actor'),
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 10,
    skip: 2,
  });
  expect(productScope('child', 'actor')).toEqual({
    dependentId: 'child',
    deletedAt: null,
    dependent: {
      deletedAt: null,
      access: {
        some: { userId: 'actor', revokedAt: null, user: { deletedAt: null, status: 'ACTIVE' } },
      },
    },
  });
  await repository.findProduct('id', 'child', 'actor');
  expect(db.medication.findFirst).toHaveBeenCalledWith({
    where: { id: 'id', ...productScope('child', 'actor') },
  });
  await repository.findTreatment('id', 'child', 'actor');
  expect(db.medicationTreatment.findFirst).toHaveBeenCalledWith({
    where: { id: 'id', ...treatmentScope('child', 'actor') },
    include: { medication: true },
  });
  await repository.listTreatments('child', 'actor', { limit: 10, offset: 2 });
  expect(db.medicationTreatment.findMany).toHaveBeenCalledWith({
    where: treatmentScope('child', 'actor'),
    include: { medication: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 10,
    skip: 2,
  });
});
test('writes condicionam papel no where, whitelist impede mudar medicamento/dependente/status interno', async () => {
  const { db, repository } = setup();
  await repository.updateProduct('id', 'child', 'actor', 'Nome');
  expect(db.medication.updateManyAndReturn).toHaveBeenCalledWith({
    where: { id: 'id', ...productScope('child', 'actor', ['OWNER', 'EDITOR']) },
    data: { name: 'Nome' },
  });
  await repository.updateTreatment('id', 'child', 'actor', ['OWNER', 'EDITOR'], {
    notes: null,
    medicationId: 'other',
    dependentId: 'other',
    deletedAt: new Date(),
  } as Parameters<typeof repository.updateTreatment>[4]);
  expect(db.medicationTreatment.updateManyAndReturn).toHaveBeenCalledWith({
    where: { id: 'id', ...treatmentScope('child', 'actor', ['OWNER', 'EDITOR']) },
    data: { notes: null },
    include: { medication: true },
  });
  const now = new Date();
  await repository.deleteTreatment('id', 'child', 'actor', now);
  expect(db.medicationTreatment.updateMany).toHaveBeenCalledWith({
    where: { id: 'id', ...treatmentScope('child', 'actor', ['OWNER']) },
    data: { deletedAt: now },
  });
  await repository.deleteProduct('id', 'child', 'actor', now);
  expect(db.medication.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'id',
      ...productScope('child', 'actor', ['OWNER']),
      treatments: { none: { deletedAt: null } },
    },
    data: { deletedAt: now },
  });
});
test('create enumera dados; não mass-assigna campos extras nem FK implícita de outro escopo', async () => {
  const { db, repository } = setup();
  await repository.createProduct('child', 'Nome');
  expect(db.medication.create).toHaveBeenCalledWith({
    data: { dependentId: 'child', name: 'Nome' },
  });
  const dto = treatmentDto('product');
  const data: CreateMedicationTreatment = {
    dependentId: 'child',
    medicationId: dto.medicationId,
    dosage: dto.dosage,
    unit: dto.unit,
    frequency: dto.frequency,
    route: null,
    startDate: new Date('2026-01-01'),
    endDate: null,
    continuousUse: false,
    instructions: null,
    prescribedBy: null,
    reason: null,
    notes: null,
    status: 'ACTIVE',
    completedAt: null,
  };
  await repository.createTreatment({ ...data, deletedAt: new Date() } as CreateMedicationTreatment);
  expect(db.medicationTreatment.create).toHaveBeenCalledWith({
    data,
    include: { medication: true },
  });
});
test('eventos fazem select mínimo/top-k e exclusão de fim não concluído, sem campos clínicos', async () => {
  const { db, repository } = setup();
  await repository.readTimeline(query, 'MEDICATION_STARTED');
  expect(db.medicationTreatment.findMany).toHaveBeenLastCalledWith({
    where: { ...treatmentScope('child', 'actor'), createdAt: { lte: query.snapshotAt }, AND: [] },
    select: {
      id: true,
      dependentId: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      completedAt: true,
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    take: 3,
  });
  await repository.readTimeline(query, 'MEDICATION_COMPLETED');
  expect(db.medicationTreatment.findMany).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: {
        ...treatmentScope('child', 'actor'),
        status: 'COMPLETED',
        endDate: { not: null },
        completedAt: { not: null, lte: query.snapshotAt },
        AND: [],
      },
      orderBy: [{ endDate: 'asc' }, { id: 'asc' }],
    }),
  );
});
test('datas UTC não são truncadas inadvertidamente em filtro DATE', () => {
  expect(
    civilTimelineWhere(
      { ...query, from: new Date('2026-01-01T12:00:00Z'), to: new Date('2026-01-03T23:00:00Z') },
      'MEDICATION_STARTED',
    ),
  ).toEqual([
    { startDate: { gte: new Date('2026-01-02') } },
    { startDate: { lte: new Date('2026-01-03') } },
  ]);
  expect(
    civilTimelineWhere({ ...query, from: new Date('2026-01-01') }, 'MEDICATION_COMPLETED'),
  ).toEqual([{ endDate: { gte: new Date('2026-01-01') } }]);
});
test.each(['asc', 'desc'] as const)(
  'keyset %s com mesmo namespace compara UUID quando data empata',
  (order) => {
    const id = randomUUID(),
      date = new Date('2026-01-01');
    expect(
      civilTimelineWhere(
        { ...query, order, after: { id: 'medication-started:' + id, eventDate: date } },
        'MEDICATION_STARTED',
      ),
    ).toEqual([
      {
        OR: [
          { startDate: { [order === 'asc' ? 'gt' : 'lt']: date } },
          { startDate: date, id: { [order === 'asc' ? 'gt' : 'lt']: id } },
        ],
      },
    ]);
  },
);
test('keyset entre namespaces e hora não meia-noite respeita ordenação global', () => {
  const date = new Date('2026-01-01');
  expect(
    civilTimelineWhere(
      { ...query, after: { id: 'dependent-created:' + randomUUID(), eventDate: date } },
      'MEDICATION_STARTED',
    ),
  ).toEqual([{ OR: [{ startDate: { gt: date } }, { startDate: date }] }]);
  expect(
    civilTimelineWhere(
      {
        ...query,
        order: 'desc',
        after: { id: 'dependent-created:' + randomUUID(), eventDate: date },
      },
      'MEDICATION_STARTED',
    ),
  ).toEqual([{ OR: [{ startDate: { lt: date } }] }]);
  expect(
    civilTimelineWhere(
      {
        ...query,
        order: 'desc',
        after: {
          id: 'medication-started:' + randomUUID(),
          eventDate: new Date('2026-01-01T12:00:00Z'),
        },
      },
      'MEDICATION_COMPLETED',
    ),
  ).toEqual([{ OR: [{ endDate: { lte: date } }] }]);
  expect(
    civilTimelineWhere(
      {
        ...query,
        after: { id: 'z-source:' + randomUUID(), eventDate: new Date('2026-01-01T12:00:00Z') },
      },
      'MEDICATION_STARTED',
    ),
  ).toEqual([{ OR: [{ startDate: { gt: date } }] }]);
});
test('mapeia date/completedAt e recusa evento de conclusão inconsistente', async () => {
  const { db, repository } = setup();
  const id = randomUUID(),
    date = new Date('2026-01-01'),
    completedAt = new Date();
  db.medicationTreatment.findMany.mockResolvedValue([
    { id, dependentId: 'child', startDate: date, endDate: date, createdAt: date, completedAt },
  ]);
  expect(await repository.readTimeline(query, 'MEDICATION_COMPLETED')).toEqual([
    { id, dependentId: 'child', eventDate: date, createdAt: completedAt },
  ]);
  db.medicationTreatment.findMany.mockResolvedValue([
    {
      id,
      dependentId: 'child',
      startDate: date,
      endDate: null,
      createdAt: date,
      completedAt: null,
    },
  ]);
  await expect(repository.readTimeline(query, 'MEDICATION_COMPLETED')).rejects.toThrow(
    'inconsistente',
  );
});
