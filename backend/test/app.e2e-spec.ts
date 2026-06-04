import request from 'supertest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from '../src/app.module'
import { PendingNotificationRetryService } from '../src/queue/services/pending-notification-retry.service'
import { NotificationPubSubService } from '../src/api/notification/notification-pubsub.service'

describe('AppController (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const configMock = {
      get: (key: string) => {
        const config: Record<string, string> = {
          'auth.jwksUri': 'https://example.com/.well-known/jwks.json',
          'auth.keycloakClientId': 'test-client',
          'auth.notifyClientId': 'notify-test-client',
          'auth.jwtIssuer': 'https://example.com/realms/test',
          'auth.frontendKeycloakIssuer': 'https://example.com/realms/frontend',
          'auth.apiGatewayKeycloakIssuer': 'https://example.com/realms/apigw',
        }
        return config[key]
      },
      getOrThrow: (key: string) => {
        const config: Record<string, string> = {
          'auth.jwksUri': 'https://example.com/.well-known/jwks.json',
          'auth.keycloakClientId': 'test-client',
          'auth.notifyClientId': 'notify-test-client',
          'auth.jwtIssuer': 'https://example.com/realms/test',
          'auth.frontendKeycloakIssuer': 'https://example.com/realms/frontend',
          'auth.apiGatewayKeycloakIssuer': 'https://example.com/realms/apigw',
        }
        const value = config[key]
        if (!value) {
          throw new Error(`Config key "${key}" not found`)
        }
        return value
      },
    }

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(configMock)
      .overrideProvider(PendingNotificationRetryService)
      .useValue({
        onModuleInit: () => Promise.resolve(),
      })
      .overrideProvider(NotificationPubSubService)
      .useValue({
        publish: () => Promise.resolve(),
        onModuleDestroy: () => Promise.resolve(),
      })
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('/ (GET)', () =>
    request(app.getHttpServer()).get('/').expect(200).expect({ message: 'Hello Backend!' }))
})
