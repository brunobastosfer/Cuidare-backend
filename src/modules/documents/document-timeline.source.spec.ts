import { documentFixture, documentDto, documentFile } from '../../../test/helpers/document-fixture';
import { timelineQuery } from '../../../test/helpers/timeline-fixture';
test.each(['asc', 'desc'] as const)(
  'documentos usam keyset %s com empates e projeção mínima',
  async (order) => {
    const f = await documentFixture(),
      instant = new Date('2026-01-01T12:30:00.123Z');
    for (let index = 0; index < 3; index++) {
      const row = await f.documents.upload(
        f.user.id,
        f.dependent.id,
        documentDto({ documentDate: '2020-01-01' }),
        documentFile(),
      );
      f.foundation.documents.rows.set(row.id, { ...row, createdAt: instant });
    }
    const service = f.service([f.source]),
      events = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ order, limit: 1, ...(cursor ? { cursor } : {}) }),
      );
      events.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(events).toHaveLength(3);
    expect(new Set(events.map((e) => e.id)).size).toBe(3);
    expect(
      events.every(
        (e) =>
          e.title === 'Documento enviado' &&
          e.summary === null &&
          e.eventDate.getTime() === instant.getTime(),
      ),
    ).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(
      /originalFileName|storageKey|checksum|Documento fictício|fixture.png/,
    );
    expect(
      (
        await service.list(
          f.user.id,
          f.dependent.id,
          timelineQuery({
            from: instant.toISOString(),
            to: instant.toISOString(),
            type: 'DOCUMENT_UPLOADED',
          }),
        )
      ).items,
    ).toHaveLength(3);
  },
);
test.each(['asc', 'desc'] as const)(
  'agregação %s preserva empate entre documento e cadastro do dependente',
  async (order) => {
    const f = await documentFixture(),
      instant = new Date('2026-01-01T12:30:00.123Z');
    const row = await f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile());
    f.foundation.documents.rows.set(row.id, { ...row, createdAt: instant });
    f.foundation.dependentRows.set(f.dependent.id, { ...f.dependent, createdAt: instant });
    const service = f.service([f.provider, f.source]),
      ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(
        f.user.id,
        f.dependent.id,
        timelineQuery({ order, limit: 1, ...(cursor ? { cursor } : {}) }),
      );
      ids.push(...page.items.map((event) => event.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(order === 'asc' ? [...ids].sort() : [...ids].sort().reverse());
  },
);
