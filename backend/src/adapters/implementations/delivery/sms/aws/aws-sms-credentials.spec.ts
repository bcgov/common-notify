import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mountedAccessKeyProvider } from '../../../../../../src/adapters/implementations/delivery/sms/aws/aws-sms-credentials'

describe('mountedAccessKeyProvider', () => {
  let dir: string

  const writeKey = async (accessKeyId: string, secretAccessKey: string) => {
    await writeFile(join(dir, 'AWS_ACCESS_KEY_ID'), accessKeyId)
    await writeFile(join(dir, 'AWS_SECRET_ACCESS_KEY'), secretAccessKey)
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aws-sms-credentials-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads the access key from the mounted files, trimming trailing newlines', async () => {
    await writeKey('AKIA1\n', 'secret1\n')

    const key = await mountedAccessKeyProvider(dir, () => 0)()

    expect(key).toEqual({
      accessKeyId: 'AKIA1',
      secretAccessKey: 'secret1',
      expiration: new Date(10 * 60_000),
    })
  })

  it('picks up a rotated key on the next call', async () => {
    const provider = mountedAccessKeyProvider(dir)
    await writeKey('AKIA1', 'secret1')
    await provider()

    await writeKey('AKIA2', 'secret2')

    expect(await provider()).toMatchObject({ accessKeyId: 'AKIA2', secretAccessKey: 'secret2' })
  })

  it('fails when a file is missing', async () => {
    await writeFile(join(dir, 'AWS_ACCESS_KEY_ID'), 'AKIA1')
    await expect(mountedAccessKeyProvider(dir)()).rejects.toThrow(/AWS_SECRET_ACCESS_KEY/)
  })

  it('fails when a file is empty', async () => {
    await writeKey('AKIA1', '  \n')
    await expect(mountedAccessKeyProvider(dir)()).rejects.toThrow(
      'AWS SMS credential file is empty: AWS_SECRET_ACCESS_KEY',
    )
  })
})
