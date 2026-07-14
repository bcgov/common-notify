import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ModuleRef } from '@nestjs/core'
import { AppModule } from './app.module'
import { StructuredLoggerService } from './common/logger'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { VersioningType, ValidationPipe } from '@nestjs/common'
import { metricsMiddleware } from './middleware/prom'
import bodyParser from 'body-parser'
import { Router } from 'express'
import { ValidationExceptionFilter } from './common/filters/validation.filter'
import { JwtGuard } from './common/guards/auth.jwt-guard'

/**
 *
 */
export async function bootstrap() {
  const app: NestExpressApplication = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Buffer early bootstrap logs until the DI-provided logger is installed below.
    bufferLogs: true,
  })

  // Route all framework and application logging through the structured logger
  // so every `new Logger(context)` call ships JSON to Loki via winston.
  app.useLogger(app.get(StructuredLoggerService))

  // Store ModuleRef globally for decorator access (used by @Queueable)
  ;(global as any).__nestModuleRef__ = app.get(ModuleRef)

  // Add body parsers for form data. The JSON limit is raised above the 100KB
  // default so a full-size mail merge send (up to MAIL_MERGE_MAX_RECIPIENTS rows) fits.
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }))
  app.use(bodyParser.json({ limit: '10mb' }))

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  app.useGlobalFilters(new ValidationExceptionFilter())

  // Apply JwtGuard globally - all routes require JWT unless marked with @Public()
  const jwtGuard = app.get(JwtGuard)
  app.useGlobalGuards(jwtGuard)

  app.use(helmet())
  app.enableCors()
  app.set('trust proxy', 1)
  app.use(metricsMiddleware)
  app.enableShutdownHooks()

  // Health check at root level (before global prefix) for Kong's health probe
  const rootRouter = Router()
  rootRouter.get('/', (req, res) => {
    res.json({ status: 'ok' })
  })
  app.use(rootRouter)

  app.setGlobalPrefix('api')
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
  })
  const config = new DocumentBuilder()
    .setTitle('Notify API')
    .setDescription('The Notify API for sending notifications via email and SMS')
    .setVersion('1.0')
    .addTag('notify')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('/api/docs', app, document)
  return app
}
