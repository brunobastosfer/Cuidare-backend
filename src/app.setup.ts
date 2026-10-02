import { randomUUID } from 'node:crypto';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Response } from 'express';
import type { ApiRequest } from './common/types/request.types';

export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  const production = config.getOrThrow<string>('NODE_ENV') === 'production';
  app.useSecurityHeaders({
    xFrameOptions: { action: 'deny' },
    contentSecurityPolicy: production ? true : { directives: { upgradeInsecureRequests: null } },
  });
  app.set('trust proxy', config.getOrThrow<number>('TRUST_PROXY_HOPS') || false);
  app.use((request: ApiRequest, response: Response, next: NextFunction) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  const origins = new Set(
    config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  app.enableCors({
    credentials: false,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      // Aplicativos nativos e clientes servidor-servidor podem não enviar Origin.
      if (origin === undefined || origins.has(origin)) callback(null, true);
      else callback(new ForbiddenException('Origem não permitida.'), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
  app.useBodyParser('json', { limit: '32kb', strict: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  if (config.getOrThrow<string>('SWAGGER_ENABLED') === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Cuidarê API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }
}
