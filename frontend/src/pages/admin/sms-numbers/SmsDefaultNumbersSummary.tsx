import type { FC } from 'react'
import { Button } from '@bcgov/design-system-react-components'
import PageSubHeading from '@/components/PageSubHeading'
import type { SmsNumber, SmsNumberCodes } from '@/api/smsNumbers.api'

interface SmsDefaultNumbersSummaryProps {
  codes: SmsNumberCodes
  numbers: readonly SmsNumber[]
  onChange: (providerCode: string) => void
}

/** What tenants of a provider send from with no default set: only the active one has a fallback. */
function notSetText(isActive: boolean, configured: string | null): string {
  if (!isActive) return 'Not set'
  return configured
    ? `Not set. Tenants without a number send from ${configured}, this environment's configured number.`
    : 'Not set.'
}

/**
 * The default number for each provider that matters here: the one SMS is sending through, and any
 * with numbers listed. Answers "what do tenants without a number of their own send from?", including
 * when nothing is set, which the table cannot show.
 */
const SmsDefaultNumbersSummary: FC<SmsDefaultNumbersSummaryProps> = ({
  codes,
  numbers,
  onChange,
}) => {
  const shown = codes.providers.filter(
    (provider) =>
      provider.code === codes.activeProvider ||
      numbers.some((number) => number.providerCode === provider.code),
  )

  return (
    <section className="sms-defaults" aria-labelledby="sms-defaults-heading">
      <PageSubHeading title="Default numbers" id="sms-defaults-heading" />
      <p className="sms-defaults__help">What tenants without a number of their own send from.</p>
      <dl className="sms-defaults__list">
        {shown.map((provider) => {
          const isActive = provider.code === codes.activeProvider
          const current = numbers.find(
            (number) => number.isDefault && number.providerCode === provider.code,
          )
          const hasNumbers = numbers.some((number) => number.providerCode === provider.code)
          return (
            <div key={provider.code} className="sms-defaults__row">
              <dt className="sms-defaults__provider">{provider.description}</dt>
              <dd className="sms-defaults__value">
                {current ? (
                  <span className="fw-semibold">{current.phoneNumber}</span>
                ) : (
                  <span className="sms-defaults__unset">
                    {notSetText(isActive, codes.defaultNumber)}
                  </span>
                )}
                {hasNumbers ? (
                  <Button
                    variant="tertiary"
                    size="small"
                    aria-label={`Change the ${provider.description} default number`}
                    onPress={() => onChange(provider.code)}
                  >
                    Change
                  </Button>
                ) : (
                  <span className="sms-defaults__unset">Add a number to set one.</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

export default SmsDefaultNumbersSummary
