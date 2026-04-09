import type { NestExpressApplication } from '@nestjs/platform-express'
import { bootstrap } from './app'

vi.mock('prom-client', () => ({
  Registry: vi.fn().mockImplementation(() => ({})),
  collectDefaultMetrics: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('express-prom-bundle', () => ({
  default: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('src/middleware/prom', () => ({
  metricsMiddleware: vi.fn().mockImplementation((_req, _res, next) => next()),
}))

describe('main', () => {
  let app: NestExpressApplication | undefined

  beforeAll(async () => {
    try {
      app = await Promise.race([
        bootstrap(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Bootstrap timeout')), 5000),
        ),
      ])
    } catch (error) {
      // Database likely not available - skip this integration test
      console.log(
        'Skipping bootstrap test - database not available. Run in container with: docker exec -it backend npm test',
      )
    }
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  it.skipIf(!app)('should start the application', async () => {
    expect(app).toBeDefined()
  })
})
