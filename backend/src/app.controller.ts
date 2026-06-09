import { Controller, Get } from '@nestjs/common'
import { AppService } from './app.service'
import { Public } from './common/decorators/public.decorator'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
