import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ModuleRef } from '@nestjs/core'
import { AppModule } from './app.module'
import { StructuredLoggerService } from './common/logger'
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

  // GC Notify-compatible routes (GcNotifyController) are reachable at
  // /gcnotify/v2/... (no /api prefix). The /gcnotify segment is kept deliberately:
  // it makes this traffic unambiguous in logs/metrics/dashboards (which are
  // labeled by raw path), while still only costing a migrating GC Notify
  // integration a single baseUrl config change (baseUrl + '/gcnotify'), same as
  // changing just the hostname would.
  app.setGlobalPrefix('api', {
    exclude: [
      // Email logo images are not API surface: buildPublicImageUrl bakes this path into
      // the <img src> of every email sent, where recipients' mail clients fetch it for as
      // long as they keep the message. It sits outside /api/v1 because a versioned path
      // implies a v2 someday, and this one can never move without breaking the logo in
      // mail already delivered.
      { path: 'logos/(.*)', method: RequestMethod.ALL },
      { path: 'gcnotify/v2/(.*)', method: RequestMethod.ALL },
    ],
  })
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
  })
  const config = new DocumentBuilder()
    .setTitle('Notify API')
    .setDescription(
      [
        'Notify sends email and SMS for your application. You post a message - or the id of a ' +
          'template Notify already holds - and Notify renders it, delivers it, retries when a ' +
          'provider fails, and records what happened to each recipient.',
        '',
        'Your API key identifies who the messages are sent for - a program, a project, an ' +
          'application, a team. Notify calls that a tenant, and it decides which templates, ' +
          'sender addresses and send limits apply. A key belongs to exactly one tenant.',
        '',
        '### Getting started',
        '',
        '1. Bind your API key to your tenant with `POST /api/v1/service/api-key/bind`. Once, ' +
          'before your first send.',
        '2. Send with `POST /api/v1/notifysimple` (or the `/email` and `/sms` shorthands).',
        '3. Follow the outcome with `GET /api/v1/notification_request/{id}/request_details`, or ' +
          'register a webhook so Notify calls you instead.',
        '',
        '### Authentication',
        '',
        'Every request goes through the API gateway and carries your key in the `X-API-KEY` ' +
          'header. There is no tenant identifier to send - the key already says who you are. ' +
          'The gateway also rate-limits per key.',
        '',
        '### Sending is asynchronous',
        '',
        'A send returns `202 Accepted` with a `notifyId` once the request is accepted - not once ' +
          'the message is delivered. Delivery happens afterwards, and its outcome is reported per ' +
          'recipient on the notification status endpoints.',
        '',
        '### Templates and parameters',
        '',
        'Message content can be sent inline or stored as a template and referenced by ' +
          '`templateId`. Either way, placeholders such as `{{firstName}}` are filled from the ' +
          '`params` supplied with the send. Give a channel a `templateId` or inline `content`, ' +
          'never both.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-KEY',
        in: 'header',
        description: 'API key issued for the gateway and bound to your tenant.',
      },
      'api-key',
    )
    .addTag('Send', 'Submit a notification for delivery')
    .addTag('Notification status', 'Find out what happened to a notification')
    .addTag('Templates', 'Reusable message content')
    .addTag('Webhooks', 'Be called when a notification changes state')
    .addTag('Reference data', 'Code tables for statuses, channels and event types')
    .addTag('API keys', 'Bind an API key to a tenant')
    .addTag('Service', 'Availability')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('/api/docs', app, document)
  return app
}
