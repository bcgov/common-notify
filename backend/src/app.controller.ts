import { Controller, Get } from '@nestjs/common'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import { AppService } from './app.service'
import { Public } from './common/decorators/public.decorator'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // No Kong route: reachable only by hitting the backend directly.
  @ApiExcludeEndpoint()
  @Get()
  @Public()
  getHello() {
    return { message: this.appService.getHello() }
  }

  @Get('health')
  @Public()
  health() {
    return { status: 'ok' }
  }
}
