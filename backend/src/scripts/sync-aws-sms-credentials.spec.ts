import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CredentialsSecret,
  kubernetesSecret,
  parameterStoreKeyFetcher,
  parseIamUserKeys,
  syncAwsSmsCredentials,
} from '../../src/scripts/sync-aws-sms-credentials'

const mockSsmSend = vi.fn()
const mockSsmConfig = vi.fn()
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    constructor(config: unknown) {
      mockSsmConfig(config)
    }
    send = mockSsmSend
  },
  GetParameterCommand: class {
    constructor(readonly input: unknown) {}
  },
}))

const oldKey = { accessKeyId: 'AKIAOLD', secretAccessKey: 'old-secret' }
const newKey = { accessKeyId: 'AKIANEW', secretAccessKey: 'new-secret' }

const parameterValue = JSON.stringify({
  pending_deletion: { AccessKeyID: 'AKIAOLD', SecretAccessKey: 'old-secret' },
  current: { AccessKeyID: 'AKIANEW', SecretAccessKey: 'new-secret' },
})

const b64 = (value: string) => Buffer.from(value).toString('base64')

describe('syncAwsSmsCredentials', () => {
  const secretHolding = (key: typeof oldKey) =>
    ({ read: vi.fn().mockResolvedValue(key), write: vi.fn() }) satisfies CredentialsSecret

  it('writes the current key when the Secret holds an older one', async () => {
    const secret = secretHolding(oldKey)
    const fetchCurrentKey = vi.fn().mockResolvedValue(newKey)

    expect(await syncAwsSmsCredentials(secret, fetchCurrentKey)).toBe('updated')
    expect(fetchCurrentKey).toHaveBeenCalledWith(oldKey)
    expect(secret.write).toHaveBeenCalledWith(newKey)
  })

  it('leaves the Secret alone when it already holds the current key', async () => {
    const secret = secretHolding(newKey)

    expect(await syncAwsSmsCredentials(secret, vi.fn().mockResolvedValue(newKey))).toBe('unchanged')
    expect(secret.write).not.toHaveBeenCalled()
  })

  it('does not touch the Secret when Parameter Store cannot be read', async () => {
    const secret = secretHolding(oldKey)
    const fetchCurrentKey = vi.fn().mockRejectedValue(new Error('The security token is invalid'))

    await expect(syncAwsSmsCredentials(secret, fetchCurrentKey)).rejects.toThrow(
      'The security token is invalid',
    )
    expect(secret.write).not.toHaveBeenCalled()
  })
})

describe('parseIamUserKeys', () => {
  it('returns the current key, not the one pending deletion', () => {
    expect(parseIamUserKeys(parameterValue)).toEqual(newKey)
  })

  it('rejects a parameter without a current key', () => {
    expect(() => parseIamUserKeys(JSON.stringify({ pending_deletion: {} }))).toThrow(
      'Parameter has no current access key',
    )
  })
})

describe('parameterStoreKeyFetcher', () => {
  beforeEach(() => {
    mockSsmSend.mockReset()
    mockSsmConfig.mockReset()
  })

  it('reads the decrypted parameter with the key it is given', async () => {
    mockSsmSend.mockResolvedValue({ Parameter: { Value: parameterValue } })

    const key = await parameterStoreKeyFetcher('ca-central-1', '/iam_users/notify-sms_keys')(oldKey)

    expect(key).toEqual(newKey)
    expect(mockSsmConfig).toHaveBeenCalledWith({ region: 'ca-central-1', credentials: oldKey })
    expect(mockSsmSend.mock.calls[0][0].input).toEqual({
      Name: '/iam_users/notify-sms_keys',
      WithDecryption: true,
    })
  })

  it('fails when the parameter has no value', async () => {
    mockSsmSend.mockResolvedValue({ Parameter: {} })
    await expect(parameterStoreKeyFetcher('ca-central-1', '/p')(oldKey)).rejects.toThrow(
      'Parameter /p has no value',
    )
  })
})

describe('kubernetesSecret', () => {
  let serviceAccountDir: string
  const url = 'https://kubernetes.default.svc/api/v1/namespaces/f6bc3f-dev/secrets/aws-sms'

  const respond = (status: number, body: unknown = {}) =>
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))

  beforeEach(async () => {
    serviceAccountDir = await mkdtemp(join(tmpdir(), 'serviceaccount-'))
    await writeFile(join(serviceAccountDir, 'namespace'), 'f6bc3f-dev')
    await writeFile(join(serviceAccountDir, 'token'), 'sa-token\n')
  })

  afterEach(async () => {
    await rm(serviceAccountDir, { recursive: true, force: true })
  })

  it('reads the key from the Secret in its own namespace', async () => {
    const fetchFn = respond(200, {
      data: { AWS_ACCESS_KEY_ID: b64('AKIAOLD'), AWS_SECRET_ACCESS_KEY: b64('old-secret\n') },
    })

    const key = await kubernetesSecret('aws-sms', fetchFn, serviceAccountDir).read()

    expect(key).toEqual(oldKey)
    expect(fetchFn).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer sa-token' }),
      }),
    )
  })

  it('patches only the two key fields', async () => {
    const fetchFn = respond(200)

    await kubernetesSecret('aws-sms', fetchFn, serviceAccountDir).write(newKey)

    const [calledUrl, init] = fetchFn.mock.calls[0]
    expect(calledUrl).toBe(url)
    expect(init.method).toBe('PATCH')
    expect(init.headers['Content-Type']).toBe('application/merge-patch+json')
    expect(JSON.parse(init.body)).toEqual({
      data: { AWS_ACCESS_KEY_ID: b64('AKIANEW'), AWS_SECRET_ACCESS_KEY: b64('new-secret') },
    })
  })

  it('fails when the Secret is missing a key', async () => {
    const fetchFn = respond(200, { data: { AWS_ACCESS_KEY_ID: b64('AKIAOLD') } })
    await expect(kubernetesSecret('aws-sms', fetchFn, serviceAccountDir).read()).rejects.toThrow(
      'Secret aws-sms has no AWS_SECRET_ACCESS_KEY',
    )
  })

  it('fails on an API error without echoing the response', async () => {
    const fetchFn = respond(403, { message: 'forbidden' })
    await expect(kubernetesSecret('aws-sms', fetchFn, serviceAccountDir).read()).rejects.toThrow(
      'GET secret aws-sms failed: HTTP 403',
    )
  })
})
