import { ConfigService } from '@nestjs/config';
import { DocumentFileValidator } from './document-file-validator';
import {
  DOCUMENT_TEST_CONFIG,
  documentFile,
  pngBytes,
  pdfBytes,
} from '../../../test/helpers/document-fixture';
const validator = () => new DocumentFileValidator(new ConfigService(DOCUMENT_TEST_CONFIG));
test('MIME vem do conteúdo, checksum SHA256 e filename nunca vira storageKey', async () => {
  const row = await validator().validate(
    documentFile(pngBytes, '../../nome\r\nprivado.png', 'application/octet-stream'),
  );
  expect(row).toMatchObject({
    mimeType: 'image/png',
    size: pngBytes.length,
    originalFileName: 'nome__privado.png',
  });
  expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
  expect(row).not.toHaveProperty('storageKey');
  expect(
    (await validator().validate(documentFile(pdfBytes, 'fixture.pdf', 'application/pdf'))).mimeType,
  ).toBe('application/pdf');
  const jpg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
  expect(
    (await validator().validate(documentFile(jpg, 'fixture.jpg', 'image/jpeg'))).mimeType,
  ).toBe('image/jpeg');
});
test.each([
  documentFile(Buffer.from('MZ executable'), 'fixture.pdf', 'application/pdf'),
  documentFile(Buffer.from('<svg onload="attack"/>'), 'fixture.png', 'image/png'),
  documentFile(Buffer.from('<html>attack</html>'), 'fixture.pdf', 'application/pdf'),
  documentFile(Buffer.from('PK zip archive'), 'fixture.pdf', 'application/pdf'),
  documentFile(pngBytes, 'fixture.exe'),
  documentFile(pngBytes, 'fixture.svg'),
  documentFile(pngBytes, 'fixture.pdf', 'application/pdf'),
  documentFile(pngBytes, 'fixture.png', 'application/pdf'),
  documentFile(Buffer.from('%PDF-1.7 incomplete'), 'fixture.pdf', 'application/pdf'),
  documentFile(pngBytes.subarray(0, 33)),
  { ...documentFile(), size: 0 },
  documentFile(Buffer.alloc(0)),
  undefined,
])('recusa executável/arquivo inválido/MIME forjado antes de scan/storage %#', async (file) => {
  await expect(validator().validate(file)).rejects.toMatchObject({ status: 400 });
});
test('limite real de bytes/whitelist configurada e dimensões são aplicados ao conteúdo', async () => {
  const config = new ConfigService({ ...DOCUMENT_TEST_CONFIG, DOCUMENT_MAX_BYTES: 10 });
  await expect(new DocumentFileValidator(config).validate(documentFile())).rejects.toMatchObject({
    status: 413,
  });
  const pdfOnly = new ConfigService({
    ...DOCUMENT_TEST_CONFIG,
    DOCUMENT_ALLOWED_MIME_TYPES: ['application/pdf'],
  });
  await expect(new DocumentFileValidator(pdfOnly).validate(documentFile())).rejects.toMatchObject({
    status: 400,
  });
  const huge = Buffer.from(pngBytes);
  huge.writeUInt32BE(30000, 16);
  await expect(validator().validate(documentFile(huge))).rejects.toMatchObject({ status: 400 });
});
