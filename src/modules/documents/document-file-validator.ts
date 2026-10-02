import {
  BadRequestException,
  FileTypeValidator,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { UploadedDocumentFile, DocumentMimeType } from '../../domain/models/document.model';
@Injectable()
export class DocumentFileValidator {
  constructor(private readonly config: ConfigService) {}
  async validate(file: UploadedDocumentFile | undefined) {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length)
      throw new BadRequestException('Envie um arquivo permitido.');
    if (file.buffer.length > this.config.getOrThrow<number>('DOCUMENT_MAX_BYTES'))
      throw new PayloadTooLargeException('Arquivo excede o limite permitido.');
    if (file.size !== file.buffer.length) throw new BadRequestException('Arquivo inválido.');
    const detected = {
      buffer: file.buffer,
      size: file.buffer.length,
      mimetype: 'application/octet-stream',
    };
    // Reutiliza file-type do Nest; sem fallback para MIME/extension do cliente.
    const validator = new FileTypeValidator({
      fileType: /^(application\/pdf|image\/png|image\/jpeg)$/,
      overrideMimeType: true,
      fallbackToMimetype: false,
    });
    if (
      !(await validator.isValid(detected)) ||
      !this.config.getOrThrow<string[]>('DOCUMENT_ALLOWED_MIME_TYPES').includes(detected.mimetype)
    )
      throw new BadRequestException('Tipo ou conteúdo de arquivo não permitido.');
    const mimeType = detected.mimetype as DocumentMimeType;
    if (file.mimetype !== mimeType && file.mimetype !== 'application/octet-stream')
      throw new BadRequestException('Tipo declarado não corresponde ao conteúdo.');
    const bytes = file.buffer;
    // Triagem estrutural limitada, não um parser completo, sanitizador ou antivírus.
    if (
      mimeType === 'application/pdf' &&
      (!/^%PDF-[12]\.\d/.test(bytes.subarray(0, 8).toString('ascii')) ||
        !/%%EOF\s*$/.test(bytes.subarray(-128).toString('ascii')))
    )
      throw new BadRequestException('Arquivo PDF incompleto.');
    if (
      mimeType === 'image/jpeg' &&
      (bytes.length < 16 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9)
    )
      throw new BadRequestException('Arquivo JPEG incompleto.');
    if (mimeType === 'image/png') {
      if (
        bytes.length < 45 ||
        bytes.subarray(12, 16).toString('ascii') !== 'IHDR' ||
        bytes.subarray(-8).toString('hex') !== '49454e44ae426082'
      )
        throw new BadRequestException('Arquivo PNG incompleto.');
      const width = bytes.readUInt32BE(16),
        height = bytes.readUInt32BE(20);
      if (!width || !height || width > 20000 || height > 20000 || width * height > 40000000)
        throw new BadRequestException('Dimensões de imagem não permitidas.');
    }
    const raw = String(file.originalname).normalize('NFC').split(/[\\/]/).at(-1) ?? '';
    const originalFileName = raw.replace(/[^\p{L}\p{M}\p{N} ._()-]/gu, '_').slice(0, 180);
    const extension = originalFileName.slice(originalFileName.lastIndexOf('.')).toLowerCase();
    const extensions =
      mimeType === 'application/pdf'
        ? ['.pdf']
        : mimeType === 'image/png'
          ? ['.png']
          : ['.jpg', '.jpeg'];
    if (!originalFileName.trim() || !extensions.includes(extension))
      throw new BadRequestException('Extensão de arquivo não permitida.');
    return {
      mimeType,
      originalFileName,
      size: bytes.length,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    };
  }
}
