import { Injectable, LoggerService } from '@nestjs/common'
import * as winston from 'winston'
import LokiTransport from 'winston-loki'

export interface LogContext {
  notificationId?: string
  tenantId?: string
  channel?: 'email' | 'sms'
  status?: 'pending' | 'processing' | 'success' | 'failed'
  gcNotifyId?: string
  duration?: number
  error?: string | Error
  [key: string]: any
}

/**
 * Structured JSON Logger Service
 *
 * Outputs logs in JSON format for Loki/Grafana ingestion
 * Includes notification-specific context fields for querying
 */
@Injectable()
export class StructuredLoggerService implements LoggerService {
  private logger: winston.Logger
  private context: string

  constructor(context: string = 'Application') {
    this.context = context

    // Determine if we're in production/k8s environment
    const isProduction = process.env.NODE_ENV === 'production' ||
                         process.env.KUBERNETES_SERVICE_HOST !== undefined

    // JSON format for production (Loki)
    const jsonFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    )

    // Pretty format for local development
    const prettyFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
        return `${timestamp} [${level}] [${context}] ${message} ${metaStr}`
      }),
    )

    // Configure transports
    const transports: winston.transport[] = [
      new winston.transports.Console(),
    ]

    // Add Loki transport in Kubernetes/production
    if (isProduction) {
      const lokiUrl = process.env.LOKI_URL || 'http://loki.f6bc3f-dev.svc.cluster.local:3100'
      const namespace = process.env.NAMESPACE || 'f6bc3f-dev'
      const podName = process.env.HOSTNAME || 'unknown'
      const instanceLabel = process.env.INSTANCE_LABEL || 'common-notify-dev'

      transports.push(
        new LokiTransport({
          host: lokiUrl,
          labels: {
            job: 'common-notify-backend',
            namespace: namespace,
            pod: podName,
            app: 'backend',
            app_kubernetes_io_instance: instanceLabel,
          },
          json: true,
          format: winston.format.json(),
          replaceTimestamp: true,
          onConnectionError: (err) => {
            console.error('Loki connection error:', err)
          },
        })
      )
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: isProduction ? jsonFormat : prettyFormat,
      transports: transports,
      exitOnError: false,
    })
  }

  /**
   * Set context for all logs from this logger instance
   */
  setContext(context: string) {
    this.context = context
  }

  /**
   * Log with custom context
   */
  private writeLog(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    logContext?: LogContext,
  ) {
    const logEntry: any = {
      level,
      message,
      context: this.context,
      timestamp: new Date().toISOString(),
    }

    if (logContext) {
      // Add notification-specific fields
      if (logContext.notificationId) logEntry.notificationId = logContext.notificationId
      if (logContext.tenantId) logEntry.tenantId = logContext.tenantId
      if (logContext.channel) logEntry.channel = logContext.channel
      if (logContext.status) logEntry.status = logContext.status
      if (logContext.gcNotifyId) logEntry.gcNotifyId = logContext.gcNotifyId
      if (logContext.duration !== undefined) logEntry.duration = logContext.duration

      // Handle error objects
      if (logContext.error) {
        if (logContext.error instanceof Error) {
          logEntry.error = {
            message: logContext.error.message,
            stack: logContext.error.stack,
            name: logContext.error.name,
          }
        } else {
          logEntry.error = logContext.error
        }
      }

      // Add any additional fields
      Object.keys(logContext).forEach((key) => {
        if (!['notificationId', 'tenantId', 'channel', 'status', 'gcNotifyId', 'duration', 'error'].includes(key)) {
          logEntry[key] = logContext[key]
        }
      })
    }

    this.logger.log(level, logEntry)
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext) {
    this.writeLog('debug', message, context)
  }

  /**
   * Info level logging
   */
  log(message: string, context?: LogContext) {
    this.writeLog('info', message, context)
  }

  /**
   * Info level logging (alias for log)
   */
  info(message: string, context?: LogContext) {
    this.writeLog('info', message, context)
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext) {
    this.writeLog('warn', message, context)
  }

  /**
   * Error level logging
   */
  error(message: string, context?: LogContext) {
    this.writeLog('error', message, context)
  }

  /**
   * Verbose level logging (mapped to debug)
   */
  verbose(message: string, context?: LogContext) {
    this.writeLog('debug', message, context)
  }

  /**
   * Helper: Log notification processing started
   */
  logNotificationStart(notificationId: string, tenantId: string, channel: 'email' | 'sms') {
    this.info('Notification processing started', {
      notificationId,
      tenantId,
      channel,
      status: 'processing',
    })
  }

  /**
   * Helper: Log notification processing success
   */
  logNotificationSuccess(
    notificationId: string,
    tenantId: string,
    channel: 'email' | 'sms',
    gcNotifyId: string,
    duration: number,
  ) {
    this.info('Notification delivered successfully', {
      notificationId,
      tenantId,
      channel,
      status: 'success',
      gcNotifyId,
      duration,
    })
  }

  /**
   * Helper: Log notification processing failure
   */
  logNotificationFailure(
    notificationId: string,
    tenantId: string,
    channel: 'email' | 'sms',
    error: Error | string,
    duration?: number,
  ) {
    this.error('Notification delivery failed', {
      notificationId,
      tenantId,
      channel,
      status: 'failed',
      error,
      duration,
    })
  }

  /**
   * Helper: Log GC Notify API call
   */
  logGcNotifyCall(
    method: string,
    endpoint: string,
    notificationId?: string,
    tenantId?: string,
  ) {
    this.debug('GC Notify API call', {
      method,
      endpoint,
      notificationId,
      tenantId,
      apiProvider: 'gc-notify',
    })
  }

  /**
   * Helper: Log queue operation
   */
  logQueueOperation(
    operation: 'add' | 'process' | 'complete' | 'failed',
    queueName: string,
    jobId?: string,
    notificationId?: string,
    context?: LogContext,
  ) {
    this.info(`Queue ${operation}: ${queueName}`, {
      operation,
      queueName,
      jobId,
      notificationId,
      ...context,
    })
  }
}
