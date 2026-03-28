import 'dotenv/config'
import type { MiddlewareConsumer } from '@nestjs/common'
import { Module, RequestMethod } from '@nestjs/common'
import { HTTPLoggerMiddleware } from './middleware/req.res.logger'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import { DatabaseModule } from './database.module'
import { UsersModule } from './users/users.module'
import { AdminModule } from './admin/admin.module'
import { ApiModule } from './api/api.module'
import { AppService } from './app.service'
import { AppController } from './app.controller'
import { MetricsController } from './metrics.controller'
import { HealthController } from './health.controller'

@Module({
  imports: [
    ConfigModule.forRoot(),
    TerminusModule,
    DatabaseModule,
    UsersModule,
    AdminModule,
    ApiModule,
  ],
  controllers: [AppController, MetricsController, HealthController],
  providers: [AppService],
})
export class AppModule {
  // let's add a middleware on all routes
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HTTPLoggerMiddleware)
      .exclude(
        { path: 'metrics', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*')
  }
}
