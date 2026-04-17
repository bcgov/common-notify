import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { customLogger } from './common/logger.config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { VersioningType, ValidationPipe } from '@nestjs/common'
import { metricsMiddleware } from 'src/middleware/prom'
import bodyParser from 'body-parser'
import { Router } from 'express'

/**
 *
 */
export async function bootstrap() {
  const app: NestExpressApplication = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: customLogger,
  })

  // Add body parsers for form data
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(bodyParser.json())

  app.useGlobalPipes(
    new ValidationPipe({ errorHttpStatusCode: 422, whitelist: true, transform: true }),
  )

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
