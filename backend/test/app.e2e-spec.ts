import request from 'supertest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppModule } from '../src/app.module'
import { PendingNotificationRetryService } from '../src/queue/services/pending-notification-retry.service'
import { NotificationPubSubService } from '../src/api/notification/notification-pubsub.service'
import { ModulesContainer } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'

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
          // 32-byte base64 key for webhook encryption (32 bytes -> 44 base64 chars)
          'encryption.key': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
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
          // 32-byte base64 key for webhook encryption (32 bytes -> 44 base64 chars)
          'encryption.key': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
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
    if (app) {
      await app.close()
    }
  })

  it('creates each module once', () => {
    // A static module registered twice runs its lifecycle hooks twice. QueueModule did: every
    // pod started two sets of Bull workers and two heartbeats under one pod name, which made
    // the monitoring page report running jobs as stalled. forwardRef() inside a global dynamic
    // module (GcNotifyModule.forRoot) produced the orphaned copies.
    // TypeOrmModule repeats legitimately: each forFeature() call is its own dynamic module.
    const counts = new Map<unknown, number>()
    for (const module of app.get(ModulesContainer).values()) {
      if (module.metatype === TypeOrmModule) continue
      counts.set(module.metatype, (counts.get(module.metatype) ?? 0) + 1)
    }
    const duplicated = [...counts]
      .filter(([, count]) => count > 1)
      .map(([metatype]) => (metatype as { name?: string })?.name)
    expect(duplicated).toEqual([])
  })

  it('/ (GET)', () =>
    request(app.getHttpServer()).get('/').expect(200).expect({ message: 'Hello Backend!' }))
})
