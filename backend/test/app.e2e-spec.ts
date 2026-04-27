import request from 'supertest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from '../src/app.module'
import { PendingNotificationRetryService } from '../src/queue/services/pending-notification-retry.service'

describe('AppController (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          const config: Record<string, string> = {
            'auth.jwksUri': 'https://example.com/.well-known/jwks.json',
            'auth.keycloakClientId': 'test-client',
            'auth.jwtIssuer': 'https://example.com/realms/test',
          }
          return config[key]
        },
      })
      .overrideProvider(PendingNotificationRetryService)
      .useValue({
        onModuleInit: () => Promise.resolve(),
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
