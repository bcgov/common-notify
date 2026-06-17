import { Module, Global } from '@nestjs/common'
import { StructuredLoggerService } from './structured-logger.service'

/**
 * Global Logger Module
 *
 * Makes StructuredLoggerService available throughout the application
 * Import this in AppModule with @Global() decorator
 */
@Global()
@Module({
  providers: [StructuredLoggerService],
  exports: [StructuredLoggerService],
})
export class LoggerModule {}
