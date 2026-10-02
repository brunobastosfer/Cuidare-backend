import { createServer, type Server, type Socket } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { ClamAvScannerRepository } from './clamav-scanner.repository';
let server: Server | undefined;
const sockets = new Set<Socket>();
afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  server = undefined;
});
async function fixture(
  reply: string | null,
  options: { fragmented?: boolean; prematureClose?: boolean } = {},
) {
  const chunks: Buffer[] = [];
  server = createServer((socket) => {
    sockets.add(socket);
    let received = Buffer.alloc(0),
      command = false,
      offset = 0;
    socket.on('data', (bytes: Buffer) => {
      received = Buffer.concat([received, bytes]);
      if (!command) {
        if (received.length < 10) return;
        expect(received.subarray(0, 10).toString()).toBe('zINSTREAM\0');
        command = true;
        offset = 10;
      }
      while (received.length >= offset + 4) {
        const length = received.readUInt32BE(offset);
        if (received.length < offset + 4 + length) return;
        offset += 4;
        if (!length) {
          if (options.prematureClose) socket.end();
          else if (reply !== null) {
            if (options.fragmented) {
              socket.write(reply.slice(0, 4));
              setImmediate(() => socket.end(reply.slice(4)));
            } else socket.end(reply);
          }
          return;
        }
        chunks.push(received.subarray(offset, offset + length));
        offset += length;
      }
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta da fixture ausente.');
  const scanner = new ClamAvScannerRepository(
    new ConfigService({
      DOCUMENT_SCANNER: 'clamav',
      DOCUMENT_SCAN_HOST: '127.0.0.1',
      DOCUMENT_SCAN_PORT: address.port,
      DOCUMENT_SCAN_TIMEOUT_MS: 150,
    }),
  );
  return { scanner, chunks };
}
test('protocolo INSTREAM envia apenas bytes em chunks e reconhece resposta fragmentada', async () => {
  const f = await fixture('stream: OK\0', { fragmented: true }),
    bytes = Buffer.alloc(140000, 42);
  expect(await f.scanner.scan(bytes)).toBe('CLEAN');
  expect(Buffer.concat(f.chunks)).toEqual(bytes);
  expect(f.chunks.map((chunk) => chunk.length)).toEqual([65536, 65536, 8928]);
});
test.each([
  ['stream: Eicar-Test-Signature FOUND\0', 'INFECTED'],
  ['stream: INSTREAM size limit exceeded. ERROR\0', 'UNAVAILABLE'],
  ['OK\0', 'UNAVAILABLE'],
  ['x'.repeat(1025), 'UNAVAILABLE'],
  [null, 'UNAVAILABLE'],
] as const)('scanner fail-closed: %s', async (reply, verdict) => {
  const f = await fixture(reply);
  expect(await f.scanner.scan(Buffer.from('fictional bytes'))).toBe(verdict);
});
test('conexão encerrada sem veredito não aprova upload', async () => {
  const f = await fixture(null, { prematureClose: true });
  expect(await f.scanner.scan(Buffer.from('fixture'))).toBe('UNAVAILABLE');
});
test('desabilitado não abre conexão', async () => {
  const scanner = new ClamAvScannerRepository(new ConfigService({ DOCUMENT_SCANNER: 'disabled' }));
  expect(scanner.configured).toBe(false);
  expect(await scanner.scan(Buffer.from('fixture'))).toBe('UNAVAILABLE');
});
test('conexão recusada não aprova conteúdo', async () => {
  const f = await fixture('stream: OK\0');
  await new Promise<void>((resolve, reject) =>
    server!.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
  expect(await f.scanner.scan(Buffer.from('fixture'))).toBe('UNAVAILABLE');
});
