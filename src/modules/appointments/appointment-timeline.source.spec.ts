import {
  appointmentFixture,
  appointmentDto,
  recommendationDto,
} from '../../../test/helpers/appointment-fixture';
import { timelineQuery } from '../../../test/helpers/timeline-fixture';
test.each(['asc', 'desc'] as const)(
  'keyset %s global entre consulta/cadastro/conclusão, inclusive empates exatos',
  async (order) => {
    const f = await appointmentFixture();
    const rec = await f.appointments.createRecommendation(
      f.user.id,
      f.dependent.id,
      f.appointment.id,
      recommendationDto({ status: 'COMPLETED' }),
    );
    const instant = new Date('2026-01-01T14:30:00.123Z');
    f.foundation.dependentRows.set(f.dependent.id, { ...f.dependent, createdAt: instant });
    f.foundation.appointments.rows.set(f.appointment.id, {
      ...f.appointment,
      createdAt: instant,
      date: instant,
    });
    f.foundation.appointments.recommendations.set(rec.id, {
      ...rec,
      createdAt: instant,
      completedAt: instant,
    });
    await f.appointments.create(f.user.id, f.dependent.id, appointmentDto());
    const service = f.service([f.provider, ...f.sources]),
      seen = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ limit: 1, order, ...(cursor ? { cursor } : {}) }),
      );
      seen.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen.map((e) => e.id)).size).toBe(5);
    const tuple = seen.map((e) => e.eventDate.toISOString() + '/' + e.id);
    expect(tuple).toEqual(order === 'asc' ? [...tuple].sort() : [...tuple].sort().reverse());
    expect(JSON.stringify(seen)).not.toContain(f.appointment.reason);
    expect(JSON.stringify(seen)).not.toContain(rec.description);
  },
);
test('filtro UTC preserva milissegundos e tipo isola fonte, sem truncar horário', async () => {
  const f = await appointmentFixture();
  const service = f.service(f.sources);
  expect(
    (
      await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({
          type: 'APPOINTMENT_RECORDED',
          from: '2026-01-01T14:30:00.123Z',
          to: '2026-01-01T14:30:00.123Z',
        }),
      )
    ).items,
  ).toHaveLength(1);
  expect(
    (
      await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ from: '2026-01-01T14:30:00.124Z' }),
      )
    ).items,
  ).toEqual([]);
});
test('corte exclui registros e conclusões posteriores; cancelamento não é conclusão', async () => {
  const f = await appointmentFixture();
  const rec = await f.appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    recommendationDto({ status: 'COMPLETED' }),
  );
  const future = new Date(Date.now() + 10000);
  f.foundation.appointments.recommendations.set(rec.id, { ...rec, completedAt: future });
  const service = f.service(f.sources);
  expect(
    (
      await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ type: 'MEDICAL_RECOMMENDATION_COMPLETED' }),
      )
    ).items,
  ).toEqual([]);
  expect(
    (
      await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ type: 'MEDICAL_RECOMMENDATION_RECORDED' }),
      )
    ).items,
  ).toHaveLength(1);
  f.foundation.appointments.recommendations.set(rec.id, {
    ...rec,
    createdAt: future,
    completedAt: future,
  });
  expect(
    (
      await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ type: 'MEDICAL_RECOMMENDATION_RECORDED' }),
      )
    ).items,
  ).toEqual([]);
});
