import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'), config.getOrThrow<string>('HOST'));
  Logger.log('Cuidarê API inicializada.', 'Bootstrap');
}

void bootstrap().catch(() => {
  // Credenciais e detalhes internos nunca vão para a saída padrão.
  Logger.error(
    'Falha ao iniciar. Verifique a configuração e a disponibilidade do banco.',
    undefined,
    'Bootstrap',
  );
  process.exitCode = 1;
});
