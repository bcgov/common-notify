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
 * The single application-wide logger. Installed as the Nest app logger in
 * app.ts (via app.useLogger), so every `new Logger(context)` call across the
 * codebase and every framework log routes through winston here.
 *
 * - Outputs JSON for Loki/Grafana ingestion in production/k8s
 * - Pretty console output in local development
 * - Adds notification-specific context fields for querying, plus typed
 *   domain helpers (logNotification*, logQueueOperation, ...)
 */
@Injectable()
export class StructuredLoggerService implements LoggerService {
  private logger: winston.Logger
  private context: string

  constructor() {
    this.context = 'Application'

    // Determine if we're in production/k8s environment
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.KUBERNETES_SERVICE_HOST !== undefined

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
    const transports: winston.transport[] = [new winston.transports.Console({ level: 'silly' })]

    // Add Loki transport in Kubernetes/production
    if (isProduction) {
      const lokiUrl = process.env.LOKI_URL || 'http://loki.f6bc3f-dev.svc.cluster.local:3100'
      const namespace = process.env.NAMESPACE || 'f6bc3f-dev'
      const podName = process.env.HOSTNAME || 'unknown'
      const instanceLabel = process.env.INSTANCE_LABEL || 'common-notify-dev'

      // Determine environment from namespace
      const environment = namespace.includes('-dev')
        ? 'dev'
        : namespace.includes('-test')
          ? 'test'
          : namespace.includes('-prod')
            ? 'prod'
            : 'unknown'

      transports.push(
        new LokiTransport({
          host: lokiUrl,
          labels: {
            job: 'common-notify-backend',
            namespace: namespace,
            pod: podName,
            app: 'backend',
            environment: environment,
            app_kubernetes_io_instance: instanceLabel,
          },
          json: true,
          format: winston.format.json(),
          replaceTimestamp: true,
          interval: 5, // Flush logs every 5 seconds
          batching: true,
          clearOnError: true,
          onConnectionError: (err) => {
            console.error('Loki connection error:', err)
          },
        }),
      )
    }

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'debug',
      format: isProduction ? jsonFormat : prettyFormat,
      transports: transports,
      exitOnError: false,
    })
  }

  /**
   * Set the default context for logs from this logger instance
   */
  setContext(context: string) {
    this.context = context
  }

  /**
   * Normalize the caller-supplied context.
   *
   * Nest's LoggerService calls methods with a plain string context (the class
   * name), whereas our own code passes a structured LogContext object. Coerce
   * a bare string into `{ context }` so both paths produce the same shape.
   */
  private toContext(context?: LogContext | string): LogContext | undefined {
    if (context === undefined || context === null) return undefined
    return typeof context === 'string' ? { context } : context
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

      // Add any additional fields (a `context` key overrides the default)
      Object.keys(logContext).forEach((key) => {
        if (
          ![
            'notificationId',
            'tenantId',
            'channel',
            'status',
            'gcNotifyId',
            'duration',
            'error',
          ].includes(key)
        ) {
          logEntry[key] = logContext[key]
        }
      })
    }

    this.logger.log(level, logEntry)
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext | string) {
    this.writeLog('debug', message, this.toContext(context))
  }

  /**
   * Info level logging
   */
  log(message: string, context?: LogContext | string) {
    this.writeLog('info', message, this.toContext(context))
  }

  /**
   * Info level logging (alias for log)
   */
  info(message: string, context?: LogContext | string) {
    this.writeLog('info', message, this.toContext(context))
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext | string) {
    this.writeLog('warn', message, this.toContext(context))
  }

  /**
   * Error level logging.
   *
   * Nest calls this as `error(message, stack, context)` with string args, while
   * our own code calls `error(message, logContext)` with a structured object.
   */
  error(message: string, context?: LogContext | string, nestContext?: string) {
    if (typeof context === 'string') {
      this.writeLog('error', message, { context: nestContext, stack: context })
      return
    }
    this.writeLog('error', message, this.toContext(context))
  }

  /**
   * Verbose level logging (mapped to debug)
   */
  verbose(message: string, context?: LogContext | string) {
    this.writeLog('debug', message, this.toContext(context))
  }

  /**
   * Helper: Log notification processing started.
   *
   * `context` (optional) overrides the log's context label, e.g. the worker
   * name, so the source is preserved on the shared logger instance.
   */
  logNotificationStart(
    notificationId: string,
    tenantId: string,
    channel: 'email' | 'sms',
    context?: string,
  ) {
    this.info('Notification processing started', {
      notificationId,
      tenantId,
      channel,
      status: 'processing',
      ...(context ? { context } : {}),
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
    context?: string,
  ) {
    this.info('Notification delivered successfully', {
      notificationId,
      tenantId,
      channel,
      status: 'success',
      gcNotifyId,
      duration,
      ...(context ? { context } : {}),
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
    context?: string,
  ) {
    this.error('Notification delivery failed', {
      notificationId,
      tenantId,
      channel,
      status: 'failed',
      error,
      duration,
      ...(context ? { context } : {}),
    })
  }

  /**
   * Helper: Log GC Notify API call
   */
  logGcNotifyCall(method: string, endpoint: string, notificationId?: string, tenantId?: string) {
    this.debug('GC Notify API call', {
      method,
      endpoint,
      notificationId,
      tenantId,
      apiProvider: 'gc-notify',
    })
  }

  /**
   * Helper: Log queue operation.
   *
   * A `failed` operation is logged at `warn` so it surfaces for alerting; all
   * other operations are informational.
   */
  logQueueOperation(
    operation: 'add' | 'process' | 'complete' | 'failed',
    queueName: string,
    jobId?: string,
    notificationId?: string,
    context?: LogContext,
  ) {
    const level = operation === 'failed' ? 'warn' : 'info'
    this.writeLog(level, `Queue ${operation}: ${queueName}`, {
      operation,
      queueName,
      jobId,
      notificationId,
      ...context,
    })
  }
}
