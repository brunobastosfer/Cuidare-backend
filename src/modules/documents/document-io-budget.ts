import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class DocumentIoBudget {
  private active = 0;
  constructor(private readonly config: ConfigService) {}
  acquire() {
    if (this.active >= this.config.getOrThrow<number>('DOCUMENT_IO_CONCURRENCY'))
      throw new HttpException(
        'Limite de operações de documentos atingido.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
}
