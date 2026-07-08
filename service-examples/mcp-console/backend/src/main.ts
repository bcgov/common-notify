import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors();
  app.setGlobalPrefix('api');

  const port = parseInt(process.env.PORT || '3100', 10);
  await app.listen(port);
  new Logger('bootstrap').log(`mcp-console backend listening on port ${port}`);
}

bootstrap();
