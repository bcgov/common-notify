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
import { applyNotifySchemaConstraints } from './api/notify/schemas/schema-constraints'

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
        'The Notify API sends email and SMS for your application. You supply recipients and message ' +
          'content, either inline or by reference to a stored template. Notify renders the content, ' +
          'attempts delivery, retries when appropriate, and records the outcome for each recipient.',
        '',
        'You need an API key linked to your notification tenant: the space for your templates, ' +
          'sender settings and send limits. A key belongs to exactly one tenant. Tenants and teams ' +
          'are managed in [CSTAR](https://bcgov.github.io/tenant-management-system/). Tenant ' +
          'administrators configure Notify settings and obtain API keys through the Notify UI.',
        '',
        '### Getting started',
        '',
        '1. Ensure you have a tenant and an administrator has configured its Notify settings.',
        '2. Ask a tenant administrator to obtain an API key from the Notify UI.',
        '3. Add the key to the `X-API-KEY` header and send with `POST /api/v1/notifysimple` ' +
          '(or the `/email` and `/sms` shorthands).',
        '4. Follow the outcome with `GET /api/v1/notification_request/{id}/request_details`, or ' +
          'register a webhook so Notify calls you instead.',
        '',
        'SMS must be enabled for your tenant before you can send or preview SMS messages. ' +
          'This is controlled by `sms_notifications`, a feature flag (an on/off setting for a capability). ' +
          'Ask a Notify platform administrator with the `NOTIFY_ADMIN` role to enable it for your tenant ' +
          'in the Notify UI under **Feature Flags**. The administrator can enable an existing tenant ' +
          'entry or use **Create New Feature Flag**, select `sms_notifications` and your tenant, ' +
          'and check **Enable this flag**. A tenant administrator role alone does not grant this permission.',
        '',
        '### Try it out from here',
        '',
        '1. Click **Authorize** and enter your API key in the `api-key` scheme.',
        "2. Select an endpoint to test, let's say `POST /api/v1/notifysimple/email` under **Send**, " +
          'and click **Try it out**.',
        '3. Choose **One message to several recipients** from the examples dropdown.',
        '4. Replace the example recipients with your own addresses and edit the subject and body.',
        '5. Set `preview` to `true` to render without sending, or omit it to send, then click **Execute**.',
        '6. The response section shows the curl command, request URL and server response. ' +
          'A successful preview returns `200`; an accepted send returns `202`.',
        '7. After a send, copy the returned `notifyId`. Under **Notification status**, open ' +
          '`GET /api/v1/notification_request/{id}/request_details`, click **Try it out**, ' +
          'and enter that ID to check delivery.',
        '',
        '### Authentication',
        '',
        'Every request goes through the API gateway and carries your key in the `X-API-KEY` ' +
          'header. There is no tenant identifier to send - the key already says who you are. ' +
          'The gateway also rate-limits per key. The GC Notify-compatible endpoints instead take ' +
          'the key the way GC Notify does: `Authorization: ApiKey-v1 {api-key}`.',
        '',
        '### Sending is asynchronous',
        '',
        'A `/notifysimple` send returns `202 Accepted` with a `notifyId` once the request is accepted - not once ' +
          'the message is delivered. Delivery happens afterwards, and its outcome is reported per ' +
          'recipient on the notification status endpoints.',
        '',
        '### Templates and parameters',
        '',
        'Message content can be sent inline or stored as a template and referenced by ' +
          '`templateId`. Either way, placeholders such as `{{firstName}}` are filled from the ' +
          '`params` supplied with the send. Give a channel `content.templateId` or inline content, ' +
          'never both.',
        '',
        '### Preview before sending',
        '',
        'On `POST /api/v1/notifysimple` and `POST /api/v1/notifysimple/email`, use `preview`: ' +
          'set to true to enable a preview of what would be sent, including template rendering, ' +
          'parameter substitution and recipients. No messages are sent. Attachments and mergearrays are not supported',
        '',
        '### Feature availability',
        '',
        'Delivery webhooks are available under **Webhooks**. GC Notify-compatible endpoints are ' +
          'available under `/gcnotify/v2`, using the authentication scheme described above. ' +
          'Notification-event sending, subscription-based recipient resolution, third-party message-app ' +
          'delivery and the CHES compatibility endpoint are not implemented. Message-app inline content ' +
          'can be rendered in preview; this does not imply delivery support.',
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
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description:
          'GC Notify-compatible endpoints only. Enter `ApiKey-v1 {api-key}`, prefix included.',
      },
      'gc-notify-api-key',
    )
    .addTag('Send', 'Submit a notification for delivery')
    .addTag('Notification status', 'Find out what happened to a notification')
    .addTag('Templates', 'Reusable message content')
    .addTag('Webhooks', 'Be called when a notification changes state')
    .addTag('Service', 'Availability')
    .build()

  const document = applyNotifySchemaConstraints(SwaggerModule.createDocument(app, config))
  SwaggerModule.setup('/api/docs', app, document)
  return app
}
