import '@capexbe/shared/preload';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { leafRouteAllowlistMiddleware } from './leaf-route-allowlist.middleware';
import { ProductionSafeExceptionFilter } from '@capexbe/shared/http-exception.filter';
import { createCompressionMiddleware } from '@capexbe/shared/compression.middleware';
import { requestIdMiddleware } from '@capexbe/shared/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.useLogger(app.get(Logger));

  if (process.env.NODE_ENV === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(createCompressionMiddleware());
  app.use(requestIdMiddleware);
  app.use(leafRouteAllowlistMiddleware());
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  app.useGlobalFilters(new ProductionSafeExceptionFilter());

  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    credentials: true,
    origin: corsOrigins.length ? corsOrigins : 'http://localhost:3000',
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-CSRF-Token'],
  });

  const port = Number(process.env.PORT) || 3018;
  await app.listen(port, '0.0.0.0');
  console.log(`capex-auth listening on :${port}`);
}

bootstrap();
