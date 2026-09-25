/**
 * Prefix for every Redis key this service owns.
 *
 * One Redis instance is shared by every deployment in a namespace, while each deployment has
 * its own database. An unprefixed key is therefore read and written by all of them: for Bull
 * that means one environment's worker consuming another's job, failing it with "notification
 * request not found", and stranding the originating row at QUEUED.
 *
 * RELEASE_NAME is set per deployment by the Helm chart. Locally it is unset and every key
 * falls under "notify".
 */
export const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || process.env.RELEASE_NAME || 'notify'

/** Namespace an application key. Bull namespaces its own keys through its `prefix` option. */
export function redisKey(key: string): string {
  return `${REDIS_KEY_PREFIX}:${key}`
}
