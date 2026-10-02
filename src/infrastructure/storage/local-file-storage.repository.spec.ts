import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, link, mkdir, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { LocalFileStorageRepository } from './local-file-storage.repository';
let root: string, storage: LocalFileStorageRepository;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cuidare-document-test-')));
  storage = new LocalFileStorageRepository(new ConfigService({ DOCUMENT_STORAGE_ROOT: root }));
});
afterEach(async () => {
  const path = relative(await realpath(tmpdir()), root);
  if (!path || path.startsWith('..') || isAbsolute(path))
    throw new Error('Cleanup fora da fixture.');
  await rm(root, { recursive: true, force: true });
});
test('objeto privado imutável, leitura limitada e remoção de compensação idempotente', async () => {
  const key = randomUUID() + '.bin',
    bytes = Buffer.from('fixture');
  await storage.put(key, bytes);
  expect(await storage.get(key, bytes.length)).toEqual(bytes);
  await expect(storage.put(key, Buffer.from('overwrite'))).rejects.toThrow();
  expect(await readFile(join(root, key))).toEqual(bytes);
  await expect(storage.get(key, bytes.length - 1)).rejects.toThrow();
  await storage.remove(key);
  await storage.remove(key);
  await expect(storage.get(key, bytes.length)).rejects.toThrow();
});
test.each([
  '../secret',
  '..\\secret',
  '/absolute.bin',
  'C:\\secret.bin',
  randomUUID(),
  'name.png',
  '00000000-0000-0000-0000-000000000000.bin',
])('rejeita chave não gerada pelo servidor: %s', async (key) => {
  await expect(storage.put(key, Buffer.from('fixture'))).rejects.toThrow();
  await expect(storage.get(key, 10)).rejects.toThrow();
  await expect(storage.remove(key)).rejects.toThrow();
});
test.each([0, -1, NaN, Infinity, 1.5, 20971521])(
  'limita alocação de leitura: %s',
  async (limit) => {
    await expect(storage.get(randomUUID() + '.bin', limit)).rejects.toThrow();
  },
);
test('não trata diretórios, hardlinks ou objetos vazios como documentos', async () => {
  const directory = randomUUID() + '.bin',
    empty = randomUUID() + '.bin',
    source = randomUUID() + '.bin',
    alias = randomUUID() + '.bin';
  await mkdir(join(root, directory));
  await writeFile(join(root, empty), Buffer.alloc(0));
  await storage.put(source, Buffer.from('fixture'));
  await link(join(root, source), join(root, alias));
  for (const key of [directory, empty, source, alias])
    await expect(storage.get(key, 10)).rejects.toThrow();
  for (const key of [directory, source, alias]) await expect(storage.remove(key)).rejects.toThrow();
});
test('não aceita raiz do filesystem ou diretório geral da aplicação', () => {
  expect(
    () =>
      new LocalFileStorageRepository(new ConfigService({ DOCUMENT_STORAGE_ROOT: process.cwd() })),
  ).toThrow();
});
test('não aceita root redirecionado por symlink/junction', async () => {
  const actual = join(root, 'actual'),
    alias = join(root, 'alias');
  await mkdir(actual, { mode: 0o700 });
  await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const redirected = new LocalFileStorageRepository(
    new ConfigService({ DOCUMENT_STORAGE_ROOT: alias }),
  );
  await expect(redirected.put(randomUUID() + '.bin', Buffer.from('fixture'))).rejects.toThrow();
});
