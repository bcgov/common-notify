/**
 * Prefix for every Redis key this service owns.
 *
 * One Redis instance is shared by every deployment in a namespace, while each deployment has
 * its own database. An unprefixed key is therefore read and written by all of them: for a queue
 * that means one environment's worker consuming another's job, failing it with "notification
 * request not found", and stranding the originating row at QUEUED.
 *
 * RELEASE_NAME is set per deployment by the Helm chart. Locally it is unset and every key
 * falls under "notify".
 */
export const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || process.env.RELEASE_NAME || 'notify'

/**
 * Prefix for BullMQ's keys, passed as its `prefix` option. A level below REDIS_KEY_PREFIX because
 * the queues ran on Bull before BullMQ, whose keys sit directly under REDIS_KEY_PREFIX with the
 * same queue names: BullMQ cannot read that layout, so it must not share it.
 */
export const QUEUE_KEY_PREFIX = `${REDIS_KEY_PREFIX}:mq`

/** Namespace an application key. BullMQ namespaces its own keys through QUEUE_KEY_PREFIX. */
export function redisKey(key: string): string {
  return `${REDIS_KEY_PREFIX}:${key}`
}
