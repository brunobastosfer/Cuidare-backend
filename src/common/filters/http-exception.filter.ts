import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  RepositoryConflictError,
  RepositoryUnavailableError,
} from '../../repository/errors/repository.error';
import type { ApiRequest } from '../types/request.types';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<ApiRequest>();
    const response = context.getResponse<Response>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno. Tente novamente.';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      if (typeof body === 'string') message = body;
      else if (
        'message' in body &&
        (typeof body.message === 'string' ||
          (Array.isArray(body.message) && body.message.every((item) => typeof item === 'string')))
      ) {
        message = body.message;
      }
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'Corpo da solicitação muito grande.';
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.parse.failed') {
      status = HttpStatus.BAD_REQUEST;
      message = 'JSON inválido.';
    } else if (error instanceof RepositoryConflictError) {
      status = HttpStatus.CONFLICT;
      message = 'Já existe um registro com esses dados.';
    } else if (error instanceof RepositoryUnavailableError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Serviço temporariamente indisponível.';
    }
    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      // Sem corpo, senha, token, URL do banco, stack ou mensagens do driver.
      this.logger.error({
        requestId: request.requestId,
        statusCode: status,
        event: 'request_failed',
      });
    }
    response.status(status).json({
      statusCode: status,
      message,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
