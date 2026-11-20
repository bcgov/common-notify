import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Keys of the Secret holding the SMS IAM user's access key, and so the file names it is mounted
 * as. The BC Gov IAM User Service rotates that key every two days and deletes the old one after
 * four; the sync CronJob copies the current one into the Secret, and Kubernetes updates the
 * mounted files in running pods.
 */
export const ACCESS_KEY_ID = 'AWS_ACCESS_KEY_ID'
export const SECRET_ACCESS_KEY = 'AWS_SECRET_ACCESS_KEY'

export interface AwsAccessKey {
  accessKeyId: string
  secretAccessKey: string
}

/**
 * The SDK caches credentials until five minutes before `expiration`, so this re-reads the files
 * about every five minutes. A rotated key stays valid for two more days, which leaves ample room.
 */
const REREAD_AFTER_MS = 10 * 60_000

async function readKeyFile(directory: string, name: string): Promise<string> {
  const value = (await readFile(join(directory, name), 'utf8')).trim()
  if (!value) throw new Error(`AWS SMS credential file is empty: ${name}`)
  return value
}

/** An SDK credentials provider reading the access key from the mounted Secret files. */
export function mountedAccessKeyProvider(directory: string, now: () => number = Date.now) {
  return async (): Promise<AwsAccessKey & { expiration: Date }> => {
    const [accessKeyId, secretAccessKey] = await Promise.all([
      readKeyFile(directory, ACCESS_KEY_ID),
      readKeyFile(directory, SECRET_ACCESS_KEY),
    ])
    return { accessKeyId, secretAccessKey, expiration: new Date(now() + REREAD_AFTER_MS) }
  }
}
