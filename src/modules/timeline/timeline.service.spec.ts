import { randomUUID } from 'node:crypto';
import {
  timelineFixture,
  timelineQuery,
  syntheticEvent,
  syntheticSource,
} from '../../../test/helpers/timeline-fixture';
import type { TimelineSource } from '../../repository/timeline-source.repository';

test.each(['asc', 'desc'] as const)(
  'agrega fontes com keyset global %s, empates e sem perdas/duplicatas',
  async (order) => {
    const f = await timelineFixture();
    const a = [
      syntheticEvent(f.dependent.id, 'TEST_A', 1),
      syntheticEvent(f.dependent.id, 'TEST_A', 2),
      syntheticEvent(f.dependent.id, 'TEST_A', 3, '2026-01-02T00:00:00.000Z'),
    ];
    const b = [
      syntheticEvent(f.dependent.id, 'TEST_B', 1),
      syntheticEvent(f.dependent.id, 'TEST_B', 2, '2026-01-03T00:00:00.000Z'),
    ];
    const service = f.service([syntheticSource('TEST_A', a), syntheticSource('TEST_B', b)]);
    const seen = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ order, limit: 2, ...(cursor ? { cursor } : {}) }),
      );
      seen.push(...page.items.map((event) => event.id));
      expect(page.hasMore).toBe(page.nextCursor !== null);
      expect(page.items.length).toBeLessThanOrEqual(2);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const expected = [a[0]!.id, a[1]!.id, b[0]!.id, a[2]!.id, b[1]!.id];
    expect(seen).toEqual(order === 'asc' ? expected : expected.reverse());
  },
);
test('filtros são aplicados antes de take, limite pode mudar sem mudar o escopo', async () => {
  const f = await timelineFixture();
  const rows = [0, 1, 2, 3, 4].map((n) =>
    syntheticEvent(f.dependent.id, 'TEST_A', n, '2026-01-0' + (n + 1) + 'T00:00:00.000Z'),
  );
  const source = syntheticSource('TEST_A', rows);
  const spy = jest.spyOn(source, 'list');
  const service = f.service([source]);
  const query = timelineQuery({
    from: '2026-01-02T00:00:00Z',
    to: '2026-01-04T00:00:00Z',
    type: 'DEPENDENT_CREATED',
    order: 'asc',
    limit: 1,
  });
  const first = await service.list(f.user.id, f.dependent.id, query);
  expect(first.items.map((event) => event.id)).toEqual([rows[1]!.id]);
  const last = await service.list(f.user.id, f.dependent.id, {
    ...query,
    limit: 100,
    cursor: first.nextCursor!,
  });
  expect(last.items.map((event) => event.id)).toEqual([rows[2]!.id, rows[3]!.id]);
  expect(last).toMatchObject({ hasMore: false, nextCursor: null });
  expect(spy.mock.calls.map(([q]) => q.take)).toEqual([2, 101]);
});
test('snapshot evita novas inserções retrodatadas entre páginas; não é snapshot histórico persistido', async () => {
  const f = await timelineFixture();
  const rows = [1, 2, 3].map((n) => syntheticEvent(f.dependent.id, 'TEST_A', n));
  const service = f.service([syntheticSource('TEST_A', rows)]);
  const first = await service.list(
    f.user.id,
    f.dependent.id,
    timelineQuery({ order: 'asc', limit: 1 }),
  );
  rows.push({
    ...syntheticEvent(f.dependent.id, 'TEST_A', 4),
    createdAt: new Date(Date.now() + 1000),
  });
  const last = await service.list(
    f.user.id,
    f.dependent.id,
    timelineQuery({ order: 'asc', limit: 100, cursor: first.nextCursor! }),
  );
  expect(last.items.map((event) => event.id)).toEqual([rows[1]!.id, rows[2]!.id]);
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as const)(
  'permite leitura %s sem conceder escrita',
  async (role) => {
    const f = await timelineFixture();
    const access = Array.from(f.foundation.accessRows.values())[0]!;
    f.foundation.accessRows.set(access.id, { ...access, role });
    expect((await f.service().list(f.user.id, f.dependent.id, timelineQuery())).items).toHaveLength(
      1,
    );
  },
);
test('nega ausência/revogação/exclusão e não consulta fontes sem autorização', async () => {
  const f = await timelineFixture();
  const source = syntheticSource('TEST_A', []);
  const spy = jest.spyOn(source, 'list');
  const service = f.service([source]);
  await expect(service.list(randomUUID(), f.dependent.id, timelineQuery())).rejects.toThrow(
    'Dependente não encontrado.',
  );
  await expect(service.list(f.user.id, randomUUID(), timelineQuery())).rejects.toThrow(
    'Dependente não encontrado.',
  );
  const access = Array.from(f.foundation.accessRows.values())[0]!;
  f.foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
  await expect(service.list(f.user.id, f.dependent.id, timelineQuery())).rejects.toThrow(
    'Dependente não encontrado.',
  );
  expect(spy).not.toHaveBeenCalled();
});
test('cursor válido não substitui permissão e fonte indisponível falha sem resposta parcial', async () => {
  const f = await timelineFixture();
  const rows = [1, 2].map((n) => syntheticEvent(f.dependent.id, 'TEST_A', n));
  const source = syntheticSource('TEST_A', rows);
  const service = f.service([source]);
  const first = await service.list(f.user.id, f.dependent.id, timelineQuery({ limit: 1 }));
  const access = Array.from(f.foundation.accessRows.values())[0]!;
  f.foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
  await expect(
    service.list(f.user.id, f.dependent.id, timelineQuery({ limit: 1, cursor: first.nextCursor! })),
  ).rejects.toThrow('Dependente não encontrado.');
  f.foundation.accessRows.set(access.id, access);
  jest.spyOn(source, 'list').mockRejectedValue(new Error('driver-sensitive-failure'));
  await expect(service.list(f.user.id, f.dependent.id, timelineQuery())).rejects.toThrow();
});
test.each([
  { limit: 0 },
  { limit: 101 },
  { limit: 1.5 },
  { from: 'not-a-date' },
  { to: 'not-a-date' },
  { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' },
])('recusa filtro inválido %j', async (change) => {
  const f = await timelineFixture();
  await expect(f.service().list(f.user.id, f.dependent.id, timelineQuery(change))).rejects.toThrow(
    'Filtros de timeline inválidos.',
  );
});
test('responde página vazia sem cursor e não altera estado/audit', async () => {
  const f = await timelineFixture();
  expect(
    await f
      .service()
      .list(f.user.id, f.dependent.id, timelineQuery({ to: '2020-01-01T00:00:00Z' })),
  ).toEqual({ items: [], nextCursor: null, hasMore: false });
  expect(f.foundation.auditRows).toEqual([]);
});
test.each([
  'other-dependent',
  'extra-property',
  'wrong-source',
  'duplicate-id',
  'too-many',
  'out-of-period',
  'future-created',
  'too-long-summary',
])('provider %s viola contrato: fail closed', async (failure) => {
  const f = await timelineFixture();
  const row = syntheticEvent(f.dependent.id, 'TEST_A', 1);
  const bad =
    failure === 'other-dependent'
      ? { ...row, dependentId: randomUUID() }
      : failure === 'extra-property'
        ? { ...row, clinicalPayload: 'Não retornar' }
        : failure === 'wrong-source'
          ? { ...row, sourceType: 'OTHER' }
          : failure === 'out-of-period'
            ? { ...row, eventDate: new Date('2020-01-01') }
            : failure === 'future-created'
              ? { ...row, createdAt: new Date('9999-01-01') }
              : failure === 'too-long-summary'
                ? { ...row, summary: 'x'.repeat(241) }
                : row;
  const rows =
    failure === 'duplicate-id'
      ? [bad, bad]
      : failure === 'too-many'
        ? Array.from({ length: 102 }, () => bad)
        : [bad];
  const source: TimelineSource = {
    sourceType: 'TEST_A',
    types: ['DEPENDENT_CREATED'],
    list: () => Promise.resolve(rows),
  };
  await expect(
    f
      .service([source])
      .list(f.user.id, f.dependent.id, timelineQuery({ from: '2026-01-01T00:00:00Z' })),
  ).rejects.toThrow();
});
test('fontes duplicadas são erro de configuração', async () => {
  const f = await timelineFixture();
  expect(() => f.service([f.provider, f.provider])).toThrow('Fonte de timeline duplicada.');
});
test('filtro por tipo não consulta fonte que não fornece esse tipo', async () => {
  const f = await timelineFixture();
  const list = jest.fn(() => Promise.resolve([]));
  const source: TimelineSource = { sourceType: 'TEST_EMPTY', types: [], list };
  expect(
    await f
      .service([source])
      .list(f.user.id, f.dependent.id, timelineQuery({ type: 'DEPENDENT_CREATED' })),
  ).toEqual({ items: [], nextCursor: null, hasMore: false });
  expect(list).not.toHaveBeenCalled();
});
