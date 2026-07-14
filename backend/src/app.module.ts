import type { MiddlewareConsumer } from '@nestjs/common'
import { Module, RequestMethod } from '@nestjs/common'
import { HTTPLoggerMiddleware } from './middleware/req.res.logger'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import { DatabaseModule } from './database.module'
import { AdminModule } from './api/admin/admin.module'
import { ApiModule } from './api/api.module'
import { AppService } from './app.service'
import { AppController } from './app.controller'
import { MetricsController } from './metrics.controller'
import { HealthController } from './health.controller'
import { AuthModule } from './auth/auth.module'
import { ChesModule } from './ches/ches.module'
import { QueueModule } from './queue/queue.module'
import { NotificationModule } from './api/notification/notification.module'
import configuration from './config/configuration'
import { AdaptersModule } from './adapters'
import { GcNotifyModule } from './api/gc-notify/gc-notify.module'
import { ClamavService } from './services/clamav.service'
import { FeatureFlagModule } from './api/feature-flag/feature-flag.module'
import { LoggerModule } from './common/logger'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [configuration],
    }),
    LoggerModule,
    TerminusModule,
    DatabaseModule,
    QueueModule,
    AdminModule,
    ApiModule,
    AuthModule,
    ChesModule,
    NotificationModule,
    FeatureFlagModule,
    AdaptersModule.forRoot(),
    GcNotifyModule.forRoot(),
  ],
  controllers: [AppController, MetricsController, HealthController],
  providers: [AppService, ClamavService],
})
export class AppModule {
  // let's add a middleware on all routes
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HTTPLoggerMiddleware)
      .exclude(
        { path: 'metrics', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
        { path: 'api/health', method: RequestMethod.ALL },
      )
      .forRoutes('*')
  }
}
