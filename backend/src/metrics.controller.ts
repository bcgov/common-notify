import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'
import { register } from './middleware/prom'
import { Public } from './common/decorators/public.decorator'

@Controller('metrics')
export class MetricsController {
  @Get()
  @Public()
  async getMetrics(@Res() res: Response) {
    const appMetrics = await register.metrics()
    res.end(appMetrics)
  }
}
