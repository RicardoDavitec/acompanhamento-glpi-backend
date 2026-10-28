import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Define o prefixo global /api para todas as rotas
  //app.setGlobalPrefix('api');

  // 1. Permite chamadas do Next.js (CORS)
  app.enableCors({
    origin: (process.env.FRONTEND_ORIGIN || 'http://localhost:4000').split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 2. Habilita validações automáticas de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = configService.getOrThrow<number>('PORT');

  const config = new DocumentBuilder()
    .setTitle('Tactical Operational Command API')
    .setDescription('Documentação da API de Acompanhamento Tático e Relatórios')
    .setVersion('1.0')
    .build();

  SwaggerModule.setup('api-docs', app, () =>
    SwaggerModule.createDocument(app, config),
  );

  await app.listen(port, '0.0.0.0');
}
bootstrap();
