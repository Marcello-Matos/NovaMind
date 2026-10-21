import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('v1');
  const webOrigin = process.env.WEB_ORIGIN;
  app.enableCors({
    // Em dev, aceita qualquer porta localhost (Flutter web usa porta dinâmica).
    origin: webOrigin ?? /^https?:\/\/localhost(:\d+)?$/,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Render/Heroku injetam PORT; em dev local usamos API_PORT (default 3001).
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`NovaMind API listening on http://localhost:${port}/v1`);
}

bootstrap();
