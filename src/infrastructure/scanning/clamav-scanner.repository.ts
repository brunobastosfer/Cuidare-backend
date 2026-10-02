import { createConnection } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MalwareScannerRepository,
  MalwareScanResult,
} from '../../repository/malware-scanner.repository';
@Injectable()
export class ClamAvScannerRepository implements MalwareScannerRepository {
  readonly configured: boolean;
  constructor(private readonly config: ConfigService) {
    this.configured = config.getOrThrow<string>('DOCUMENT_SCANNER') === 'clamav';
  }
  scan(bytes: Buffer): Promise<MalwareScanResult> {
    if (!this.configured) return Promise.resolve('UNAVAILABLE');
    return new Promise((resolve) => {
      const socket = createConnection({
        host: this.config.getOrThrow<string>('DOCUMENT_SCAN_HOST'),
        port: this.config.getOrThrow<number>('DOCUMENT_SCAN_PORT'),
      });
      let settled = false,
        response = Buffer.alloc(0);
      const finish = (result: MalwareScanResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        socket.destroy();
        resolve(result);
      };
      const deadline = setTimeout(
        () => finish('UNAVAILABLE'),
        this.config.getOrThrow<number>('DOCUMENT_SCAN_TIMEOUT_MS'),
      );
      socket.on('error', () => finish('UNAVAILABLE'));
      socket.on('close', () => finish('UNAVAILABLE'));
      socket.on('data', (chunk: Buffer) => {
        if (response.length + chunk.length > 1024) {
          finish('UNAVAILABLE');
          return;
        }
        response = Buffer.concat([response, chunk]);
        const end = response.indexOf(0);
        if (end < 0) return;
        const message = response.subarray(0, end).toString('ascii');
        finish(
          message === 'stream: OK'
            ? 'CLEAN'
            : /^stream: .+ FOUND$/.test(message)
              ? 'INFECTED'
              : 'UNAVAILABLE',
        );
      });
      socket.on('connect', () => {
        // INSTREAM: conteúdo enviado em memória, sem nomes/paths ou shell.
        socket.write(Buffer.from('zINSTREAM\0'));
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536),
            length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}
