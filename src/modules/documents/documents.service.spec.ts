import { randomUUID } from 'node:crypto';
import { documentFixture, documentDto, documentFile } from '../../../test/helpers/document-fixture';
import { timelineQuery } from '../../../test/helpers/timeline-fixture';
import { documentView } from '../../presentation/views/document.view';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
const original = { ...process.env };
afterEach(() => {
  for (const key of ['DOCUMENT_MAX_STORED_BYTES', 'DOCUMENT_MAX_STORED_FILES']) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
test('upload/download e correção de metadados com views e auditoria mínimas', async () => {
  const f = await documentFixture();
  const row = await f.documents.upload(
    f.user.id,
    f.dependent.id,
    documentDto({ description: 'Texto privado', documentDate: '2026-01-01' }),
    documentFile(),
  );
  expect(row).toMatchObject({
    createdByUserId: f.user.id,
    documentDate: new Date('2026-01-01'),
    mimeType: 'image/png',
  });
  expect(row.storageKey).toMatch(/^[0-9a-f-]+\.bin$/);
  expect((await f.documents.download(f.user.id, f.dependent.id, row.id)).bytes).toEqual(
    documentFile().buffer,
  );
  await f.documents.find(f.user.id, f.dependent.id, row.id);
  const changed = await f.documents.update(f.user.id, f.dependent.id, row.id, {
    title: 'Correção',
    description: null,
  });
  expect(changed.storageKey).toBe(row.storageKey);
  const publicJson = JSON.stringify(documentView(changed));
  expect(publicJson).not.toMatch(/storageKey|checksum|createdByUserId|deletedAt|scannedAt/);
  const audit = JSON.stringify(f.foundation.auditRows);
  expect(audit).not.toContain('Texto privado');
  expect(audit).not.toContain(row.originalFileName);
  expect(audit).not.toContain(row.checksum);
  expect(f.foundation.auditRows.map((r) => r.action)).toEqual([
    'DOCUMENT_UPLOADED',
    'DOCUMENT_DOWNLOADED',
    'DOCUMENT_VIEWED',
    'DOCUMENT_UPDATED',
  ]);
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as DependentAccessRole[])(
  'papel %s limita upload/correção/exclusão, não depende do criador',
  async (role) => {
    const f = await documentFixture(),
      row = await f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile());
    const other = await f.users.create({
      name: 'Fixture',
      email: 'role@example.com',
      passwordHash: 'fixture',
    });
    await f.foundation.dependentAccess.create({
      userId: other.id,
      dependentId: f.dependent.id,
      role,
      relationship: null,
    });
    expect((await f.documents.download(other.id, f.dependent.id, row.id)).bytes).toEqual(
      documentFile().buffer,
    );
    const upload = () =>
      f.documents.upload(other.id, f.dependent.id, documentDto(), documentFile());
    const update = () => f.documents.update(other.id, f.dependent.id, row.id, { category: 'EXAM' });
    if (role === 'VIEWER') {
      await expect(upload()).rejects.toThrow();
      await expect(update()).rejects.toThrow();
    } else {
      await upload();
      await update();
    }
    if (role !== 'OWNER')
      await expect(f.documents.delete(other.id, f.dependent.id, row.id)).rejects.toThrow();
    else await f.documents.delete(other.id, f.dependent.id, row.id);
  },
);
test('usuário estranho/ID de outro dependente não consulta storage nem revela detalhes', async () => {
  const f = await documentFixture(),
    row = await f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile());
  const other = await f.users.create({
    name: 'Fixture',
    email: 'stranger@example.com',
    passwordHash: 'fixture',
  });
  const get = jest.spyOn(f.storage, 'get');
  await expect(f.documents.download(other.id, f.dependent.id, row.id)).rejects.toThrow(
    'Dependente não encontrado.',
  );
  await expect(f.documents.download(f.user.id, randomUUID(), row.id)).rejects.toThrow(
    'Dependente não encontrado.',
  );
  expect(get).not.toHaveBeenCalled();
});
test.each(['INFECTED', 'UNAVAILABLE'] as const)(
  'scanner %s bloqueia armazenamento e registro',
  async (verdict) => {
    const f = await documentFixture();
    f.scanner.verdict = verdict;
    await expect(
      f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile()),
    ).rejects.toMatchObject({ status: verdict === 'INFECTED' ? 400 : 503 });
    expect(f.storage.rows.size).toBe(0);
    expect(f.foundation.documents.rows.size).toBe(0);
    expect(f.foundation.auditRows).toEqual([]);
  },
);
test('scanner desativado ou falhando bloqueia upload', async () => {
  const f = await documentFixture();
  f.scanner.configured = false;
  await expect(
    f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile()),
  ).rejects.toMatchObject({ status: 503 });
  f.scanner.configured = true;
  jest.spyOn(f.scanner, 'scan').mockRejectedValue(new Error('sensitive'));
  await expect(
    f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile()),
  ).rejects.toMatchObject({ status: 503 });
  expect(f.storage.rows.size).toBe(0);
});
test('falha de audit reverte metadata e compensa somente o novo objeto', async () => {
  const f = await documentFixture(),
    existing = await f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile());
  jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValue(new Error('audit failed'));
  await expect(
    f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile()),
  ).rejects.toThrow('audit failed');
  expect(f.foundation.documents.rows.size).toBe(1);
  expect(f.storage.rows.size).toBe(1);
  expect(f.storage.rows.has(existing.storageKey)).toBe(true);
  expect(f.storage.removed).toHaveLength(1);
  await expect(
    f.documents.update(f.user.id, f.dependent.id, existing.id, { title: 'No commit' }),
  ).rejects.toThrow();
  await expect(f.documents.delete(f.user.id, f.dependent.id, existing.id)).rejects.toThrow();
  await expect(f.documents.download(f.user.id, f.dependent.id, existing.id)).rejects.toThrow();
  expect(f.foundation.documents.rows.get(existing.id)).toMatchObject({
    title: existing.title,
    deletedAt: null,
  });
});
test('revogação após scan cancela commit e compensa objeto; após leitura cancela entrega', async () => {
  const f = await documentFixture(),
    access = [...f.foundation.accessRows.values()][0]!;
  jest.spyOn(f.scanner, 'scan').mockImplementationOnce(() => {
    f.foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
    return Promise.resolve('CLEAN');
  });
  await expect(
    f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile()),
  ).rejects.toThrow('Dependente não encontrado.');
  expect(f.storage.rows.size).toBe(0);
  f.foundation.accessRows.set(access.id, access);
  const row = await f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile()),
    get = f.storage.get.bind(f.storage);
  jest.spyOn(f.storage, 'get').mockImplementationOnce((key, max) => {
    f.foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
    return get(key, max);
  });
  await expect(f.documents.download(f.user.id, f.dependent.id, row.id)).rejects.toThrow();
  expect(f.foundation.auditRows.some((r) => r.action === 'DOCUMENT_DOWNLOADED')).toBe(false);
});
test('checksum/tamanho adulterados falham fechado, sem auditar download ou expor erro de storage', async () => {
  const f = await documentFixture(),
    row = await f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile());
  f.storage.rows.set(row.storageKey, Buffer.alloc(row.size));
  await expect(f.documents.download(f.user.id, f.dependent.id, row.id)).rejects.toMatchObject({
    status: 503,
  });
  expect(f.foundation.auditRows.some((r) => r.action === 'DOCUMENT_DOWNLOADED')).toBe(false);
});
test('quota inclui soft delete; exclusão retém bytes e remove acesso/timeline', async () => {
  const f = await documentFixture(),
    row = await f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile());
  f.config.set('DOCUMENT_MAX_STORED_FILES', 1);
  await f.documents.delete(f.user.id, f.dependent.id, row.id);
  expect(f.storage.rows.has(row.storageKey)).toBe(true);
  await expect(f.documents.download(f.user.id, f.dependent.id, row.id)).rejects.toThrow();
  expect(
    (await f.service([f.source]).list(f.user.id, f.dependent.id, timelineQuery())).items,
  ).toEqual([]);
  await expect(
    f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile()),
  ).rejects.toMatchObject({ status: 413 });
  expect(f.storage.rows.size).toBe(1);
});
test('quota de bytes, PATCH vazio e data impossível não persistem dados', async () => {
  const f = await documentFixture();
  f.config.set('DOCUMENT_MAX_STORED_BYTES', 1);
  await expect(
    f.documents.upload(f.user.id, f.dependent.id, documentDto(), documentFile()),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    f.documents.update(f.user.id, f.dependent.id, randomUUID(), {}),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    f.documents.upload(
      f.user.id,
      f.dependent.id,
      documentDto({ documentDate: '2026-02-29' }),
      documentFile(),
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(f.storage.rows.size).toBe(0);
});
