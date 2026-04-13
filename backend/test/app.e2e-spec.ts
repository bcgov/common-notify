import request from 'supertest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from '../src/app.module'

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
            'auth.jwksUri':
              'https://dev.loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/certs',
            'auth.keycloakClientId': 'notify-6388',
            'auth.jwtIssuer': 'https://dev.loginproxy.gov.bc.ca/auth/realms/standard',
          }
          return config[key]
        },
      })
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  it('/ (GET)', () =>
    request(app.getHttpServer()).get('/').expect(200).expect({ message: 'Hello Backend!' }))
})
