import type Redis from 'ioredis'
import { redisKey } from '../common/redis/redis-namespace'
import { minuteOf } from './queue-metrics'

/**
 * What the delivery reconciler has done, kept in Redis so the monitoring page reads the same
 * answer from any pod: the last pass, per-minute counts of what it acted on, and the most recent
 * actions. Only the pod holding the reconcile lock writes, once per pass.
 */

export type ReconcileKind = 'pending' | 'ingestion' | 'scheduled' | 'batch' | 'delivery'
export type ReconcileAction = 'retried' | 'requeued' | 'gave-up'
export const RECONCILE_ACTIONS: ReconcileAction[] = ['retried', 'requeued', 'gave-up']

export interface ReconcilePassRecord {
  at: number
  durationMs: number
  intervalMs: number
  /** Work items the finders returned, including those left alone because their job was live. */
  found: number
  outcomes: Partial<Record<ReconcileAction | 'in-progress', number>>
}

export interface ReconcileActionRecord {
  at: number
  kind: ReconcileKind
  action: ReconcileAction
  jobId: string
  notifyId: string
  tenantId: string
}

export const RECONCILE_LAST_PASS_KEY = redisKey('delivery-reconcile:last-pass')
export const RECONCILE_RECENT_KEY = redisKey('delivery-reconcile:recent')
export const reconcileCountKey = (minute: number) => redisKey(`delivery-reconcile:count:${minute}`)

export const RECENT_ACTIONS_KEPT = 50
const COUNT_TTL_SECONDS = 2 * 60 * 60

/** Record one pass. Best-effort: the caller logs a failure and recovery itself is unaffected. */
export async function recordReconcilePass(
  redis: Redis,
  pass: ReconcilePassRecord,
  actions: ReconcileActionRecord[],
): Promise<void> {
  const multi = redis.multi().set(RECONCILE_LAST_PASS_KEY, JSON.stringify(pass))
  if (actions.length > 0) {
    const countKey = reconcileCountKey(minuteOf(pass.at))
    for (const action of actions) multi.hincrby(countKey, action.action, 1)
    multi
      .expire(countKey, COUNT_TTL_SECONDS)
      .lpush(RECONCILE_RECENT_KEY, ...actions.map((action) => JSON.stringify(action)))
      .ltrim(RECONCILE_RECENT_KEY, 0, RECENT_ACTIONS_KEPT - 1)
  }
  await multi.exec()
}

export interface ReconcileActivity {
  lastPass: ReconcilePassRecord | null
  /** Actions per type over the last `windowMinutes`, including the current minute. */
  counts: Record<ReconcileAction, number>
  recent: ReconcileActionRecord[]
}

export async function readReconcileActivity(
  redis: Redis,
  now: number,
  windowMinutes: number,
): Promise<ReconcileActivity> {
  const current = minuteOf(now)
  const pipeline = redis.pipeline().get(RECONCILE_LAST_PASS_KEY).lrange(RECONCILE_RECENT_KEY, 0, -1)
  for (let minute = current - windowMinutes + 1; minute <= current; minute++) {
    pipeline.hgetall(reconcileCountKey(minute))
  }
  const results = (await pipeline.exec()) ?? []
  const [lastPass, recent, ...minutes] = results.map(([error, value]) => {
    if (error) throw error
    return value
  })

  const counts: Record<ReconcileAction, number> = { retried: 0, requeued: 0, 'gave-up': 0 }
  for (const minute of minutes as Array<Record<string, string>>) {
    for (const action of RECONCILE_ACTIONS) counts[action] += Number(minute?.[action] ?? 0) || 0
  }
  return {
    lastPass: lastPass ? (JSON.parse(lastPass as string) as ReconcilePassRecord) : null,
    counts,
    recent: (recent as string[]).map((entry) => JSON.parse(entry) as ReconcileActionRecord),
  }
}
