import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ModuleRef } from '@nestjs/core'
import { AppModule } from './app.module'
import { customLogger } from './common/logger.config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { VersioningType, ValidationPipe, RequestMethod } from '@nestjs/common'
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
    logger: customLogger,
  })

  // Store ModuleRef globally for decorator access (used by @Queueable)
  ;(global as any).__nestModuleRef__ = app.get(ModuleRef)

  // Add body parsers for form data
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(bodyParser.json())

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

  // GC Notify-compatible routes (GcNotifyController) are reachable at
  // /gcnotify/v2/... (no /api prefix). The /gcnotify segment is kept deliberately:
  // it makes this traffic unambiguous in logs/metrics/dashboards (which are
  // labeled by raw path), while still only costing a migrating GC Notify
  // integration a single baseUrl config change (baseUrl + '/gcnotify'), same as
  // changing just the hostname would.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'gcnotify/v2/(.*)', method: RequestMethod.ALL },
      { path: 'gcnotify-passthrough/v2/(.*)', method: RequestMethod.ALL },
    ],
  })
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
