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

describe('AdaptersModule', () => {
  it('forRoot returns dynamic module with all adapters and maps', () => {
    const dynamic = AdaptersModule.forRoot()

    expect(dynamic.module).toBe(AdaptersModule)
    expect(dynamic.global).toBe(true)
    expect(dynamic.providers).toHaveLength(11)
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

    // First 5 providers are adapter classes (Ches, Nodemailer, Log email + SMS adapters)
    const adapterProviders = (dynamic.providers ?? []).slice(0, 5)
    expect(adapterProviders).toContain(ChesEmailTransport)
    expect(adapterProviders).toContain(NodemailerEmailTransport)
    expect(adapterProviders).toContain(LogEmailTransport)
    expect(adapterProviders).toContain(TwilioSmsTransport)
    expect(adapterProviders).toContain(AcsSmsTransport)
  })
})
