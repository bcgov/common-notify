import { AdaptersModule } from '../../src/adapters/adapters.module'
import {
  EMAIL_ADAPTER,
  EMAIL_ADAPTER_MAP,
  SMS_ADAPTER,
  SMS_ADAPTER_MAP,
  SENDER_STORE,
} from '../../src/adapters/tokens'
import { ChesEmailTransport } from '../../src/adapters/implementations/delivery/email/ches/ches-email.adapter'
import { NodemailerEmailTransport } from '../../src/adapters/implementations/delivery/email/nodemailer/nodemailer-email.adapter'
import { LogEmailTransport } from '../../src/adapters/implementations/delivery/email/log/log-email.adapter'
import { TwilioSmsTransport } from '../../src/adapters/implementations/delivery/sms/twilio/twilio-sms.adapter'
import { AcsSmsTransport } from '../../src/adapters/implementations/delivery/sms/acs/acs-sms.adapter'
import { AwsSmsTransport } from '../../src/adapters/implementations/delivery/sms/aws/aws-sms.adapter'
import { SmsCircuitBreaker } from '../../src/adapters/implementations/delivery/sms/sms-circuit-breaker'

describe('AdaptersModule', () => {
  it('forRoot returns dynamic module with all adapters and maps', () => {
    const dynamic = AdaptersModule.forRoot()

    expect(dynamic.module).toBe(AdaptersModule)
    expect(dynamic.global).toBe(true)
    expect(dynamic.providers).toHaveLength(13)
    expect(dynamic.providers).toContain(SmsCircuitBreaker)
    expect(dynamic.exports).toContain(EMAIL_ADAPTER)
    expect(dynamic.exports).toContain(SMS_ADAPTER)
    expect(dynamic.exports).toContain(EMAIL_ADAPTER_MAP)
    expect(dynamic.exports).toContain(SMS_ADAPTER_MAP)
    expect(dynamic.exports).toContain(SENDER_STORE)

    const providerProvides = (dynamic.providers ?? []).map((p: { provide?: unknown }) => p.provide)
    expect(providerProvides).toContain(EMAIL_ADAPTER)
    expect(providerProvides).toContain(SMS_ADAPTER)
    expect(providerProvides).toContain(EMAIL_ADAPTER_MAP)
    expect(providerProvides).toContain(SMS_ADAPTER_MAP)

    // First 6 providers are adapter classes (Ches, Nodemailer, Log email + SMS adapters)
    const adapterProviders = (dynamic.providers ?? []).slice(0, 6)
    expect(adapterProviders).toContain(ChesEmailTransport)
    expect(adapterProviders).toContain(NodemailerEmailTransport)
    expect(adapterProviders).toContain(LogEmailTransport)
    expect(adapterProviders).toContain(TwilioSmsTransport)
    expect(adapterProviders).toContain(AcsSmsTransport)
    expect(adapterProviders).toContain(AwsSmsTransport)
  })

  it('sends SMS through the circuit breaker, whichever provider is configured', () => {
    const provider = (AdaptersModule.forRoot().providers ?? []).find(
      (p) => (p as { provide?: unknown }).provide === SMS_ADAPTER,
    ) as { useFactory: (...args: unknown[]) => unknown }
    const acs = { name: 'acs', send: vi.fn() }
    const wrapped = { name: 'acs', send: vi.fn() }
    const breaker = { wrap: vi.fn(() => wrapped) }

    const adapter = provider.useFactory({ acs }, { get: () => 'acs' }, breaker)

    expect(breaker.wrap).toHaveBeenCalledWith(acs)
    expect(adapter).toBe(wrapped)
  })

  it('sends SMS through AWS when no provider is configured', () => {
    const provider = (AdaptersModule.forRoot().providers ?? []).find(
      (p) => (p as { provide?: unknown }).provide === SMS_ADAPTER,
    ) as { useFactory: (...args: unknown[]) => unknown }
    const acs = { name: 'acs', send: vi.fn() }
    const aws = { name: 'aws', send: vi.fn() }
    const breaker = { wrap: vi.fn((transport) => transport) }

    const adapter = provider.useFactory({ acs, aws }, { get: () => undefined }, breaker)

    expect(adapter).toBe(aws)
  })
})
