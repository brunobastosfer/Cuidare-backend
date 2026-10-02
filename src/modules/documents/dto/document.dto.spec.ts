import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentDto, UpdateDocumentDto } from './document.dto';
import { documentDto } from '../../../../test/helpers/document-fixture';
test('DTO normaliza título e valida data civil/opcionais null', async () => {
  const dto = plainToInstance(
    CreateDocumentDto,
    documentDto({ title: '  Fixture  ', documentDate: '2024-02-29', description: null }),
  );
  expect(await validate(dto)).toEqual([]);
  expect(dto.title).toBe('Fixture');
});
test.each([
  { title: null },
  { title: ' ' },
  { title: 'a'.repeat(161) },
  { category: null },
  { category: 'UNKNOWN' },
  { documentDate: '2026-02-29' },
  { description: 'a'.repeat(2001) },
  { storageKey: '../../private' },
  { mimeType: 'application/pdf' },
  { checksum: 'client' },
  { size: 1 },
  { createdByUserId: 'client' },
  { dependentId: 'client' },
  { scannedAt: 'client' },
  { deletedAt: null },
])('DTO recusa %j', async (override) => {
  expect(
    (
      await validate(plainToInstance(CreateDocumentDto, { ...documentDto(), ...override }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).length,
  ).toBeGreaterThan(0);
});
test.each([{ title: null }, { category: null }])(
  'PATCH não admite null obrigatório: %j',
  async (body) => {
    expect((await validate(plainToInstance(UpdateDocumentDto, body))).length).toBeGreaterThan(0);
  },
);
