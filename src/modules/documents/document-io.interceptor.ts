import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { defer, finalize } from 'rxjs';
import type { Response } from 'express';
import { DocumentIoBudget } from './document-io-budget';
@Injectable()
export class DocumentIoInterceptor implements NestInterceptor {
  constructor(private readonly budget: DocumentIoBudget) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const release = this.budget.acquire();
    const response = context.switchToHttp().getResponse<Response>();
    let processingFinished = false,
      responseFinished = false;
    const settle = () => {
      if (!processingFinished || !responseFinished) return;
      release();
      response.off('finish', onResponseEnd);
      response.off('close', onResponseEnd);
    };
    const onResponseEnd = () => {
      responseFinished = true;
      settle();
    };
    response.once('finish', onResponseEnd);
    response.once('close', onResponseEnd);
    // Segurar o slot até terminar tanto o trabalho quanto a resposta. Clientes
    // lentos não liberam buffers cedo; abortar não libera um scan ainda ativo.
    return defer(() => next.handle()).pipe(
      finalize(() => {
        processingFinished = true;
        responseFinished ||= response.destroyed || response.writableFinished;
        settle();
      }),
    );
  }
}
