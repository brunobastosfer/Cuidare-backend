import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FileStorageRepository } from '../../repository/file-storage.repository';
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/;
@Injectable()
export class LocalFileStorageRepository implements FileStorageRepository {
  private readonly root: string;
  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('DOCUMENT_STORAGE_ROOT'));
    if (this.root === parse(this.root).root || this.root === resolve(process.cwd()))
      throw new Error('Configure um diretório exclusivo de documentos privados.');
  }
  private async location(key: string) {
    if (!KEY.test(key)) throw new Error('Chave de storage inválida.');
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const root = await lstat(this.root);
    if (
      !root.isDirectory() ||
      root.isSymbolicLink() ||
      (process.platform !== 'win32' && (root.mode & 0o077) !== 0)
    )
      throw new Error('Storage privado indisponível.');
    const canonical = await realpath(this.root);
    if (
      process.platform === 'win32'
        ? canonical.toLowerCase() !== this.root.toLowerCase()
        : canonical !== this.root
    )
      throw new Error('Storage privado indisponível.');
    const target = resolve(this.root, key);
    if (dirname(target) !== this.root) throw new Error('Chave de storage inválida.');
    return target;
  }
  async put(key: string, bytes: Buffer) {
    if (bytes.length < 1 || bytes.length > 20971520) throw new Error('Tamanho de objeto inválido.');
    const path = await this.location(key);
    const handle = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(path).catch(() => undefined); // Só este novo objeto; nunca sobrescrever.
      throw error;
    }
  }
  async get(key: string, maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 20971520)
      throw new Error('Limite de leitura inválido.');
    const path = await this.location(key);
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1)
      throw new Error('Objeto privado inválido.');
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size > maxBytes ||
        stat.size < 1 ||
        (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
      )
        throw new Error('Objeto privado inválido.');
      const bytes = Buffer.alloc(maxBytes + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!read.bytesRead) break;
        offset += read.bytesRead;
      }
      if (offset > maxBytes) throw new Error('Objeto privado inválido.');
      return bytes.subarray(0, offset);
    } finally {
      await handle.close();
    }
  }
  async remove(key: string) {
    const path = await this.location(key);
    try {
      const entry = await lstat(path);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1)
        throw new Error('Objeto privado inválido.');
      await unlink(path);
    } catch (error) {
      if (!(
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
  }
}
