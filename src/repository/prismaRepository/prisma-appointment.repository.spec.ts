import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import {
  PrismaAppointmentRepository,
  appointmentScope,
  recommendationScope,
} from './prisma-appointment.repository';
import { appointmentTimelineWhere } from './appointment-timeline-where';
import type { TimelineSourceQuery } from '../timeline-source.repository';
import {
  appointmentEventPrefix,
  type AppointmentTimelineType,
} from '../../domain/models/appointment.model';
function fixture() {
  const delegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    updateManyAndReturn: jest.fn().mockResolvedValue([]),
  });
  const db = { appointment: delegate(), medicalRecommendation: delegate() };
  return {
    db,
    repository: new PrismaAppointmentRepository(db as unknown as Prisma.TransactionClient),
  };
}
const query: TimelineSourceQuery = {
  userId: 'actor',
  dependentId: 'child',
  from: null,
  to: null,
  order: 'asc',
  type: null,
  after: null,
  snapshotAt: new Date(),
  take: 3,
};
test('creates enumeram dados, sem mass assignment de IDs/timestamps/deletedAt', async () => {
  const { db, repository } = fixture();
  const a = {
    dependentId: 'child',
    date: new Date(),
    specialty: null,
    professionalName: null,
    institutionName: null,
    reason: 'Fixture',
    notes: null,
    followUpDate: null,
  };
  await repository.create({ ...a, id: 'client', deletedAt: new Date() } as Parameters<
    typeof repository.create
  >[0]);
  expect(db.appointment.create).toHaveBeenCalledWith({ data: a });
  const rec = {
    dependentId: 'child',
    appointmentId: 'app',
    title: 'Fixture',
    description: 'Fixture',
    status: 'PENDING' as const,
    startDate: new Date('2026-01-01'),
    endDate: null,
    completedAt: null,
  };
  await repository.createRecommendation({
    ...rec,
    id: 'client',
    deletedAt: new Date(),
  } as Parameters<typeof repository.createRecommendation>[0]);
  expect(db.medicalRecommendation.create).toHaveBeenCalledWith({ data: rec });
});
test('escopos filtram usuário ativo/vínculo/papel e soft delete em filho, pai e dependente', async () => {
  const { db, repository } = fixture();
  expect(appointmentScope('child', 'actor')).toEqual({
    dependentId: 'child',
    deletedAt: null,
    dependent: {
      deletedAt: null,
      access: {
        some: { userId: 'actor', revokedAt: null, user: { status: 'ACTIVE', deletedAt: null } },
      },
    },
  });
  await repository.find('id', 'child', 'actor');
  expect(db.appointment.findFirst).toHaveBeenCalledWith({
    where: { id: 'id', ...appointmentScope('child', 'actor') },
  });
  await repository.findRecommendation('rec', 'app', 'child', 'actor');
  expect(db.medicalRecommendation.findFirst).toHaveBeenCalledWith({
    where: { id: 'rec', appointmentId: 'app', ...recommendationScope('child', 'actor') },
  });
  await repository.list('child', 'actor', { limit: 5, offset: 2 });
  expect(db.appointment.findMany).toHaveBeenCalledWith({
    where: appointmentScope('child', 'actor'),
    take: 5,
    skip: 2,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  await repository.listRecommendations('app', 'child', 'actor', { limit: 5, offset: 2 });
  expect(db.medicalRecommendation.findMany).toHaveBeenCalledWith({
    where: { appointmentId: 'app', ...recommendationScope('child', 'actor') },
    take: 5,
    skip: 2,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
});
test('writes enumerados e papéis no where impedem mover filhos/mass assignment', async () => {
  const { db, repository } = fixture();
  await repository.update('id', 'child', 'actor', {
    notes: null,
    dependentId: 'foreign',
    deletedAt: new Date(),
  } as Parameters<typeof repository.update>[3]);
  expect(db.appointment.updateManyAndReturn).toHaveBeenCalledWith({
    where: { id: 'id', ...appointmentScope('child', 'actor', ['OWNER', 'EDITOR']) },
    data: { notes: null },
  });
  await repository.updateRecommendation('rec', 'app', 'child', 'actor', {
    title: 'Correction',
    appointmentId: 'foreign',
    dependentId: 'foreign',
  } as Parameters<typeof repository.updateRecommendation>[4]);
  expect(db.medicalRecommendation.updateManyAndReturn).toHaveBeenCalledWith({
    where: {
      id: 'rec',
      appointmentId: 'app',
      ...recommendationScope('child', 'actor', ['OWNER', 'EDITOR']),
    },
    data: { title: 'Correction' },
  });
  const now = new Date();
  await repository.delete('app', 'child', 'actor', now);
  expect(db.appointment.updateMany).toHaveBeenCalledWith({
    where: {
      id: 'app',
      ...appointmentScope('child', 'actor', ['OWNER']),
      recommendations: { none: { deletedAt: null } },
    },
    data: { deletedAt: now },
  });
  await repository.deleteRecommendation('rec', 'app', 'child', 'actor', now);
  expect(db.medicalRecommendation.updateMany).toHaveBeenCalledWith({
    where: { id: 'rec', appointmentId: 'app', ...recommendationScope('child', 'actor', ['OWNER']) },
    data: { deletedAt: now },
  });
  await repository.hasRecommendations('app', 'child', 'actor');
  expect(db.medicalRecommendation.findFirst).toHaveBeenLastCalledWith({
    where: { appointmentId: 'app', ...recommendationScope('child', 'actor') },
    select: { id: true },
  });
});
test.each([
  'APPOINTMENT_RECORDED',
  'MEDICAL_RECOMMENDATION_RECORDED',
  'MEDICAL_RECOMMENDATION_COMPLETED',
] as AppointmentTimelineType[])(
  'fonte %s faz projeção mínima, período/keyset e top-k no SQL',
  async (type) => {
    const { db, repository } = fixture();
    await repository.readTimeline(query, type);
    const calls = (
      type === 'APPOINTMENT_RECORDED'
        ? db.appointment.findMany.mock.calls
        : db.medicalRecommendation.findMany.mock.calls
    ) as unknown[][];
    const args = calls[0]?.[0];
    expect(args).toMatchObject({
      take: 3,
      where: { dependentId: 'child', deletedAt: null, AND: [] },
      select: { id: true, dependentId: true },
    });
    expect(JSON.stringify(args)).not.toMatch(/reason|description|professionalName|notes/);
    if (type === 'MEDICAL_RECOMMENDATION_COMPLETED')
      expect(args).toMatchObject({
        where: { status: 'COMPLETED', completedAt: { not: null, lte: query.snapshotAt } },
      });
    else expect(args).toMatchObject({ where: { createdAt: { lte: query.snapshotAt } } });
  },
);
test.each(['asc', 'desc'] as const)(
  'keyset %s compara UUID só no mesmo namespace e preserva instante',
  (order) => {
    const id = randomUUID(),
      now = new Date('2026-01-01T14:30:00.123Z'),
      op = order === 'asc' ? 'gt' : 'lt';
    expect(
      appointmentTimelineWhere(
        {
          ...query,
          order,
          after: { eventDate: now, id: appointmentEventPrefix('APPOINTMENT_RECORDED') + id },
        },
        'APPOINTMENT_RECORDED',
      ),
    ).toEqual([{ OR: [{ date: { [op]: now } }, { date: now, id: { [op]: id } }] }]);
    const other = appointmentTimelineWhere(
      { ...query, order, after: { eventDate: now, id: 'dependent-created:whatever' } },
      'APPOINTMENT_RECORDED',
    );
    expect(other).toEqual([
      { OR: [{ date: { [op]: now } }, ...(order === 'desc' ? [{ date: now }] : [])] },
    ]);
  },
);
test('filtros inclusivos com hora e cursor inválido no próprio namespace falham fechado', () => {
  const instant = new Date('2026-01-01T14:30:00.123Z');
  expect(
    appointmentTimelineWhere({ ...query, from: instant, to: instant }, 'APPOINTMENT_RECORDED'),
  ).toEqual([{ date: { gte: instant } }, { date: { lte: instant } }]);
  expect(() =>
    appointmentTimelineWhere(
      { ...query, after: { eventDate: instant, id: 'appointment-recorded:invalid' } },
      'APPOINTMENT_RECORDED',
    ),
  ).toThrow();
});
