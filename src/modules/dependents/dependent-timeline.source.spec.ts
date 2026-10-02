import { randomUUID } from 'node:crypto';
import type { TimelineSourceQuery } from '../../repository/timeline-source.repository';
import { timelineFixture } from '../../../test/helpers/timeline-fixture';
async function setup() {
  const f = await timelineFixture();
  const query: TimelineSourceQuery = {
    userId: f.user.id,
    dependentId: f.dependent.id,
    from: null,
    to: null,
    type: null,
    order: 'desc',
    snapshotAt: new Date(),
    after: null,
    take: 2,
  };
  const list = (changes: Partial<TimelineSourceQuery> = {}) =>
    f.foundation.run((repositories) => f.provider.list({ ...query, ...changes }, repositories));
  return { ...f, query, list };
}
test('projeta somente cadastro; não transforma nascimento/edição/audit/care-task em evento clínico', async () => {
  const f = await setup();
  const [event] = await f.list();
  expect(event).toEqual({
    id: 'dependent-created:' + f.dependent.id,
    dependentId: f.dependent.id,
    type: 'DEPENDENT_CREATED',
    title: 'Dependente cadastrado',
    summary: null,
    eventDate: f.dependent.createdAt,
    sourceId: f.dependent.id,
    sourceType: 'DEPENDENT',
    createdAt: f.dependent.createdAt,
  });
  expect(JSON.stringify(event)).not.toContain(f.dependent.fullName);
  expect(JSON.stringify(event)).not.toContain('2020-02-29');
  await f.foundation.dependents.updateForUser(f.dependent.id, f.user.id, ['OWNER'], {
    fullName: 'Novo nome',
  });
  expect(await f.list()).toEqual([event]);
});
test('período inclusivo, snapshot de criação e keyset aplicam-se ao evento', async () => {
  const f = await setup();
  const date = f.dependent.createdAt;
  expect(await f.list({ from: date, to: date, type: 'DEPENDENT_CREATED' })).toHaveLength(1);
  expect(await f.list({ from: new Date(date.getTime() + 1) })).toEqual([]);
  expect(await f.list({ to: new Date(date.getTime() - 1) })).toEqual([]);
  expect(await f.list({ snapshotAt: new Date(date.getTime() - 1) })).toEqual([]);
  const [event] = await f.list();
  if (!event) throw new Error('Evento ausente');
  expect(await f.list({ after: event })).toEqual([]);
  expect(await f.list({ order: 'asc', after: event })).toEqual([]);
});
test('repository aplica escopo mesmo quando fonte é chamada sem service', async () => {
  const f = await setup();
  expect(await f.list({ userId: randomUUID() })).toEqual([]);
  expect(await f.list({ dependentId: randomUUID() })).toEqual([]);
  const access = Array.from(f.foundation.accessRows.values())[0]!;
  f.foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
  expect(await f.list()).toEqual([]);
});
test('soft delete ou conta bloqueada exclui fonte, sem excluir registros físicos', async () => {
  const f = await setup();
  f.users.rows.set(f.user.email, { ...f.user, status: 'BLOCKED' });
  expect(await f.list()).toEqual([]);
  f.users.rows.set(f.user.email, f.user);
  await f.foundation.dependents.softDeleteForUser(f.dependent.id, f.user.id);
  expect(await f.list()).toEqual([]);
  expect(f.foundation.dependentRows.size).toBe(1);
});
