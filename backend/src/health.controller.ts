import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Public } from './common/decorators/public.decorator'

@ApiTags('Service')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Service health',
    description:
      'Reports whether the service and its database are reachable. Requires no authentication, ' +
      'so it is safe to use as an availability probe.',
  })
  @ApiOkResponse({
    description: 'The service is healthy.',
    schema: {
      example: {
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'A dependency is unavailable; see `error`.' })
  @HealthCheck()
  @Public()
  check() {
    return this.health.check([() => this.db.pingCheck('database')])
  }
}
