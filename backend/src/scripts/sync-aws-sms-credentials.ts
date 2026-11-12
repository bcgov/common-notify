import { readFile } from 'node:fs/promises'
import { Logger } from '@nestjs/common'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import {
  ACCESS_KEY_ID,
  AwsAccessKey,
  SECRET_ACCESS_KEY,
} from '../adapters/implementations/delivery/sms/aws/aws-sms-credentials'
import { describeError } from '../common/utils/describe-error'

/**
 * Copies the SMS IAM user's current access key from Parameter Store into the Secret the backend
 * mounts. Run by the aws-sms-credentials-sync CronJob.
 *
 * The BC Gov IAM User Service creates a new key every two days, deletes the previous one two days
 * later, and writes both to `/iam_users/<user>_keys`. Reading that parameter takes a working key,
 * so the one already in the Secret fetches its successor: if this job fails for two days running,
 * the Secret's key is deleted and has to be re-seeded by hand from Parameter Store.
 */

export interface CredentialsSecret {
  read(): Promise<AwsAccessKey>
  write(key: AwsAccessKey): Promise<void>
}

export type FetchCurrentKey = (using: AwsAccessKey) => Promise<AwsAccessKey>

export async function syncAwsSmsCredentials(
  secret: CredentialsSecret,
  fetchCurrentKey: FetchCurrentKey,
): Promise<'updated' | 'unchanged'> {
  const stored = await secret.read()
  const current = await fetchCurrentKey(stored)
  if (current.accessKeyId === stored.accessKeyId) return 'unchanged'
  await secret.write(current)
  return 'updated'
}

/** The parameter holds `{ current: {...}, pending_deletion: {...} }`; only `current` is used. */
export function parseIamUserKeys(value: string): AwsAccessKey {
  const { current } = JSON.parse(value) as {
    current?: { AccessKeyID?: string; SecretAccessKey?: string }
  }
  if (!current?.AccessKeyID || !current.SecretAccessKey) {
    throw new Error('Parameter has no current access key')
  }
  return { accessKeyId: current.AccessKeyID, secretAccessKey: current.SecretAccessKey }
}

export function parameterStoreKeyFetcher(region: string, parameterName: string): FetchCurrentKey {
  return async (using) => {
    const ssm = new SSMClient({ region, credentials: using })
    const { Parameter } = await ssm.send(
      new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
    )
    if (!Parameter?.Value) throw new Error(`Parameter ${parameterName} has no value`)
    return parseIamUserKeys(Parameter.Value)
  }
}

const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount'

/**
 * The Secret, through the Kubernetes API with the pod's service account token. The API server's
 * CA comes from NODE_EXTRA_CA_CERTS, set on the CronJob.
 */
export function kubernetesSecret(
  name: string,
  fetchFn: typeof fetch = fetch,
  serviceAccountDir = SERVICE_ACCOUNT_DIR,
): CredentialsSecret {
  const request = async (method: 'GET' | 'PATCH', body?: unknown) => {
    const [namespace, token] = await Promise.all([
      readFile(`${serviceAccountDir}/namespace`, 'utf8'),
      readFile(`${serviceAccountDir}/token`, 'utf8'),
    ])
    const url = `https://kubernetes.default.svc/api/v1/namespaces/${namespace.trim()}/secrets/${name}`
    const response = await fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Content-Type': 'application/merge-patch+json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`${method} secret ${name} failed: HTTP ${response.status}`)
    }
    return (await response.json()) as { data?: Record<string, string> }
  }

  const decode = (data: Record<string, string> | undefined, key: string) => {
    const value = data?.[key]
    if (!value) throw new Error(`Secret ${name} has no ${key}`)
    return Buffer.from(value, 'base64').toString('utf8').trim()
  }

  return {
    async read() {
      const { data } = await request('GET')
      return {
        accessKeyId: decode(data, ACCESS_KEY_ID),
        secretAccessKey: decode(data, SECRET_ACCESS_KEY),
      }
    },
    async write(key) {
      await request('PATCH', {
        data: {
          [ACCESS_KEY_ID]: Buffer.from(key.accessKeyId).toString('base64'),
          [SECRET_ACCESS_KEY]: Buffer.from(key.secretAccessKey).toString('base64'),
        },
      })
    },
  }
}

async function main(logger: Logger): Promise<void> {
  const { AWS_REGION, AWS_SMS_KEYS_PARAMETER, AWS_SMS_CREDENTIALS_SECRET } = process.env
  if (!AWS_REGION || !AWS_SMS_KEYS_PARAMETER || !AWS_SMS_CREDENTIALS_SECRET) {
    throw new Error(
      'AWS_REGION, AWS_SMS_KEYS_PARAMETER and AWS_SMS_CREDENTIALS_SECRET are required',
    )
  }
  const result = await syncAwsSmsCredentials(
    kubernetesSecret(AWS_SMS_CREDENTIALS_SECRET),
    parameterStoreKeyFetcher(AWS_REGION, AWS_SMS_KEYS_PARAMETER),
  )
  logger.log(
    result === 'updated'
      ? `Secret ${AWS_SMS_CREDENTIALS_SECRET} updated to the current access key`
      : `Secret ${AWS_SMS_CREDENTIALS_SECRET} already holds the current access key`,
  )
}

if (require.main === module) {
  const logger = new Logger('SyncAwsSmsCredentials')
  main(logger).catch((error: unknown) => {
    logger.error(`AWS SMS credential sync failed: ${describeError(error)}`)
    process.exitCode = 1
  })
}
