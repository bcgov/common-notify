Notify Queueing Architecture (Ingestion + Delivery Model)

Overview

This document describes the queueing architecture for the Notify service using Redis + BullMQ.

The design focuses on: • Decoupling ingestion from delivery • Supporting multi-channel notifications
• Enabling delayed/scheduled sends • Keeping workers simple and scalable

⸻

High-Level Flow

Client → API Gateway → Notify API ↓ Persist notification_request (status = queued) ↓ Add job →
Ingestion Queue ↓ Ingestion Worker processes request ↓ Fan-out → Delivery Queues (per channel) ↓
Channel Workers send messages ↓ Update notification_request status

⸻

Queues

1. Ingestion Queue

Name: notification-ingestion

Responsibilities: • Light validation • Determine channels (email, sms, etc.) • Normalize request •
Resolve templates (if applicable) • Fan-out into channel-specific jobs

⸻

2. Delivery Queues (Per Channel)

Examples: • email-queue • sms-queue • msgapp-queue

Responsibilities: • Send notifications • Handle retries • Apply rate limiting • Handle
provider-specific logic

⸻

Payload Design

Ingestion Queue Payload

Wrap the incoming API request with system metadata:

```
{
  notifyId: string,
  tenantId: string,
  request: SimpleNotifyRequest | EventTypeNotifyRequest,
  requestedAt: string
}
```

⸻

Delivery Queue Payload

Normalized, channel-specific jobs:

```
{
  notifyId: string,
  tenantId: string,
  channel: 'email' | 'sms' | 'msgApp',
  payload: EmailChannel | SmsChannel | MsgAppChannel,
  attempt: number
}
```

⸻

Processing Flow (Detailed)

Step 1: API Layer • Receives unified request payload • Stores record in notification_request •
Status = queued

⸻

Step 2: Ingestion Queue

await ingestionQueue.add('process', job);

⸻

Step 3: Ingestion Worker

Responsibilities: • Determine channels present in request • Resolve templates (event-based requests)
• Apply params, overrides, augments • Normalize into channel-specific payloads

Then enqueue:

await emailQueue.add('send', job); await smsQueue.add('send', job);

⸻

Step 4: Delivery Workers

Each channel worker: • Sends message to provider (CHES, GC Notify, etc.) • Handles retries • Updates
DB status

⸻

Scheduling / Delayed Sends

Handled entirely by BullMQ.

Example:

```
await emailQueue.add('send-email', payload, {
  delay: sendAt ? sendAt - Date.now() : 0
});
```

BullMQ: • Stores delayed jobs in Redis • Promotes jobs when ready • No polling required

⸻

Redis Persistence (Important)

To prevent data loss:

Enable AOF (Append Only File)

appendonly yes appendfsync everysec

This ensures: • Jobs survive restarts • Minimal data loss (~1 second worst case)

⸻

Database Responsibility

The database is the source of truth, not Redis.

Table: notification_request

Tracks: • Tenant • Status • Created time • Final outcome

Queues are ephemeral execution layers, not storage.

⸻

Status Lifecycle

Example statuses: • queued • processing • sending • completed • failed

⸻

Benefits of This Approach

Scalability • Independent scaling per channel • Parallel processing

Simplicity • Clear separation of concerns • No scheduler service required

Reliability • Redis AOF persistence • DB-backed status tracking

Flexibility • Easy to add new channels • Supports templates and overrides

⸻

Summary

The system uses: • 1 Ingestion Queue → orchestration • N Delivery Queues → execution • BullMQ →
scheduling + retries • Redis (AOF) → durable queue storage • Postgres → system of record

⸻

Key Principle

Use the API payload for ingestion, but normalize to channel-specific payloads before delivery.

⸻

Implementation: Service-Layer with @Queueable Decorator

Strategy

Use a NestJS decorator @Queueable to handle queueing logic at the controller level. This provides: •
Fire-and-forget pattern (immediate response to client) • Automatic idempotency (notifyId as job key)
• Correlation ID generation for end-to-end tracing • Zero boilerplate in endpoint code

The Decorator

```typescript
import { v4 as uuid } from 'uuid'

export function Queueable(queueName: string = 'ingestion') {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = async function (this: any, payload: any, req?: any, ...args: any[]) {
      const notifyId = uuid()
      const correlationId = uuid()
      const tenantId = payload.tenantId || req?.user?.tenantId

      // Store in DB with status 'queued'
      await this.db.notification_request.create({
        id: notifyId,
        correlationId,
        tenantId,
        status: 'queued',
        createdAt: new Date(),
      })

      // Extract context for logging
      this.logger.log(`Notification queued: ${notifyId}`, { correlationId, tenantId })

      // Enqueue to ingestion queue
      // Use notifyId as jobId for idempotency (prevents duplicate queuing)
      await this.queues[queueName].add(
        'process',
        {
          notifyId,
          correlationId,
          tenantId,
          request: payload,
          requestedAt: new Date().toISOString(),
        },
        {
          jobId: notifyId, // Idempotency key
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      )

      // Return immediately (fire & forget)
      return {
        notifyId,
        correlationId,
        status: 'queued',
        message: 'Notification queued for processing',
      }
    }

    return descriptor
  }
}
```

Usage in Controllers

Simply add the decorator to endpoints:

```typescript
@Controller('api/v1/notify')
export class NotifyController {
  @Post('simple')
  @Queueable('ingestion')
  async sendSimple(@Body() payload: SimpleNotifyRequest) {}

  @Post('event')
  @Queueable('ingestion')
  async sendEvent(@Body() payload: EventNotifyRequest) {}

  @Post('simple-user')
  @Queueable('ingestion')
  async sendSimpleUser(@Body() payload: SimpleNotifyRequest) {}
}
```

Idempotency Strategy

1. **Job Key:** notifyId used as BullMQ jobId prevents duplicate queue entries
2. **DB Check:** Ingestion worker checks if notification_request.id already exists
3. **Retry Safety:** Failed jobs stored with unique correlationId for tracing

```typescript
// In ingestion worker
async handle(job: Job) {
  const { notifyId, correlationId, request } = job.data;

  // Check if already processed
  const existing = await this.db.notification_request.findById(notifyId);
  if (existing && existing.status !== 'queued') {
    this.logger.log(`Skipping duplicate: ${notifyId}`, { correlationId });
    return; // Idempotent
  }

  // Process notification...
  this.logger.log(`Processing: ${notifyId}`, { correlationId });
}
```

Correlation ID Threading

Pass correlationId through all logs and queue payloads:

```typescript
// API Layer
this.logger.log('Notification queued', {
  correlationId,
  notifyId,
  tenantId,
})

// Ingestion Worker
this.logger.log('Processing ingestion job', {
  correlationId,
  notifyId,
})

// Delivery Worker
this.logger.log('Sending email', {
  correlationId,
  notifyId,
  channel: 'email',
})
```

This enables full end-to-end tracing: `API → Queue → Worker → Provider`

Error Handling & Dead Letter Queue

```typescript
ingestionQueue.on('failed', async (job, err) => {
  const { correlationId, notifyId } = job.data

  this.logger.error('Job failed', {
    correlationId,
    notifyId,
    error: err.message,
    attempt: job.attemptsMade,
  })

  if (job.attemptsMade >= job.opts.attempts) {
    // Move to DLQ after max retries
    await this.deadLetterQueue.add(job.data, { jobId: notifyId })

    // Update DB
    await this.db.notification_request.update(notifyId, {
      status: 'failed',
      errorReason: err.message,
    })
  }
})
```

Response Pattern (Fire & Forget)

Client receives immediate response:

```json
{
  "notifyId": "550e8400-e29b-41d4-a716-446655440000",
  "correlationId": "760e8400-e29b-41d4-a716-446655440111",
  "status": "queued",
  "message": "Notification queued for processing"
}
```

Client can later poll `/api/v1/notify/{notifyId}` for final status.
