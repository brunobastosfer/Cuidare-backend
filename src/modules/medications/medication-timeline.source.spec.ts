import { medicationFixture, treatmentDto } from '../../../test/helpers/medication-fixture';
import { timelineQuery } from '../../../test/helpers/timeline-fixture';
test.each(['asc', 'desc'] as const)(
  'timeline real de tratamentos %s: start/end, empates e paginação global',
  async (order) => {
    const f = await medicationFixture();
    const a = await f.medications.createTreatment(
      f.user.id,
      f.dependent.id,
      treatmentDto(f.product.id, { status: 'COMPLETED', endDate: '2026-01-01' }),
    );
    const b = await f.medications.createTreatment(
      f.user.id,
      f.dependent.id,
      treatmentDto(f.product.id, { status: 'COMPLETED', endDate: '2026-01-03' }),
    );
    const service = f.service([f.provider, f.source]);
    const seen = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ order, limit: 1, ...(cursor ? { cursor } : {}) }),
      );
      seen.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen.map((e) => e.id)).size).toBe(5);
    expect(seen.filter((e) => e.type === 'MEDICATION_STARTED')).toHaveLength(2);
    expect(
      seen
        .filter((e) => e.type === 'MEDICATION_COMPLETED')
        .map((e) => e.sourceId)
        .sort(),
    ).toEqual([a.id, b.id].sort());
    expect(JSON.stringify(seen)).not.toContain(a.dosage);
    expect(JSON.stringify(seen)).not.toContain(f.product.name);
  },
);
test('período com hora UTC e tipo filtra sem truncar datas civis; end planejado não é fato', async () => {
  const f = await medicationFixture();
  await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id, { endDate: '2026-01-02' }),
  );
  const service = f.service([f.source]);
  expect(
    (await service.list(f.user.id, f.dependent.id, timelineQuery({ type: 'MEDICATION_COMPLETED' })))
      .items,
  ).toEqual([]);
  expect(
    (await service.list(f.user.id, f.dependent.id, timelineQuery({ from: '2026-01-01T12:00:00Z' })))
      .items,
  ).toEqual([]);
  expect(
    (
      await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-01T00:00:00Z',
          type: 'MEDICATION_STARTED',
        }),
      )
    ).items,
  ).toHaveLength(1);
});
test('completedAt exclui conclusões registradas depois do corte, embora início seja antigo', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id),
  );
  await f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {
    status: 'COMPLETED',
    endDate: '2026-01-02',
  });
  const stored = f.foundation.medications.treatments.get(row.id)!;
  f.foundation.medications.treatments.set(row.id, {
    ...stored,
    completedAt: new Date(Date.now() + 10000),
  });
  const page = await f.service([f.source]).list(f.user.id, f.dependent.id, timelineQuery());
  expect(page.items.map((e) => e.type)).toEqual(['MEDICATION_STARTED']);
});
