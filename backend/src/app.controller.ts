import { Controller, Get, Post, Request } from '@nestjs/common'
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

  @Get('/api/v1/test/api-key')
  @Post('/api/v1/test/api-key')
  testApiKey(@Request() req: any) {
    // Kong API Key authentication is handled by the key-auth plugin
    // This endpoint verifies that the API key authentication is working
    const apiKey = req.headers['x-api-key'] || req.query.apikey
    return {
      status: 'success',
      message: 'API key authentication is working',
      authenticated: !!apiKey,
      timestamp: new Date().toISOString(),
    }
  }
}
