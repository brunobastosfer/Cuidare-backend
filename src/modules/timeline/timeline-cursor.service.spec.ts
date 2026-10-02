import { createHmac, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { TimelineCursorService, type TimelineCursorScope } from './timeline-cursor.service';

const key = 'timeline-cursor-unit-key-'.repeat(4);
const service = new TimelineCursorService(new ConfigService({ JWT_SECRET: key }));
const now = Date.parse('2026-01-15T12:00:00.000Z');
const scope: TimelineCursorScope = {
  userId: randomUUID(),
  dependentId: randomUUID(),
  from: null,
  to: null,
  type: null,
  order: 'desc',
};
const position = { eventDate: new Date('2026-01-01T00:00:00.000Z'), id: 'fixture:001' };
function token() {
  return service.encode(scope, service.start(now), position);
}

test('roundtrip mantém snapshot/expiração e cursor não contém identidade/payload clínico em texto aberto', () => {
  const value = token();
  expect(service.decode(value, scope, now + 1)).toEqual({ ...service.start(now), after: position });
  const decoded = JSON.parse(Buffer.from(value.split('.')[1]!, 'base64url').toString()) as Record<
    string,
    unknown
  >;
  expect(Object.keys(decoded)).toEqual(['v', 'scope', 'snapshotAt', 'expiresAt', 'after']);
  expect(JSON.stringify(decoded)).not.toContain(scope.userId);
  expect(JSON.stringify(decoded)).not.toContain(scope.dependentId);
});
test.each([
  { userId: randomUUID() },
  { dependentId: randomUUID() },
  { order: 'asc' as const },
  { from: new Date('2026-01-01') },
  { to: new Date('2026-02-01') },
  { type: 'DEPENDENT_CREATED' as const },
])('não aceita cursor fora do escopo %j', (change) => {
  expect(() => service.decode(token(), { ...scope, ...change }, now)).toThrow(
    'Cursor inválido ou expirado.',
  );
});
test.each(['tl1.bad.bad', '', 'x'.repeat(1025), 'tl1.aaa.' + 'b'.repeat(43)])(
  'recusa cursor malformado %s',
  (value) => {
    expect(() => service.decode(value, scope, now)).toThrow('Cursor inválido ou expirado.');
  },
);
test('recusa adulteração, expiração na fronteira, relógio anterior ao snapshot e segredo diferente', () => {
  const value = token();
  const parts = value.split('.');
  expect(() =>
    service.decode('tl1.' + parts[1]!.slice(0, -1) + 'A.' + parts[2], scope, now),
  ).toThrow();
  expect(() => service.decode(value, scope, now + 30 * 60 * 1000)).toThrow();
  expect(() => service.decode(value, scope, now - 1)).toThrow();
  const other = new TimelineCursorService(
    new ConfigService({ JWT_SECRET: 'other-key'.repeat(10) }),
  );
  expect(() => other.decode(value, scope, now)).toThrow();
});
test.each([
  { v: 2 },
  { extra: 'not allowed' },
  { expiresAt: now + 30 * 60 * 1000 + 1 },
  { snapshotAt: 'not-a-date' },
  { after: { id: 'invalid', eventDate: position.eventDate.toISOString() } },
  { after: { id: position.id, eventDate: '2026-01-01T00:00:00Z' } },
])('recusa payload assinado incompatível ou inválido %j', (change) => {
  const original = JSON.parse(
    Buffer.from(token().split('.')[1]!, 'base64url').toString(),
  ) as Record<string, unknown>;
  const payload = Buffer.from(JSON.stringify({ ...original, ...change })).toString('base64url');
  const signature = createHmac('sha256', key)
    .update('cuidare-timeline-v1\0signature\0' + payload)
    .digest('base64url');
  expect(() => service.decode('tl1.' + payload + '.' + signature, scope, now)).toThrow();
});
