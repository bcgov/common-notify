import type { ComponentProps, FC } from 'react'
import { TooltipTrigger as BcdsTooltipTrigger } from '@bcgov/design-system-react-components'

/**
 * How long to hover before a tooltip appears.
 *
 * 250ms responds to a deliberate hover without flashing tooltips at someone sweeping
 * the pointer across a form.
 */
const DEFAULT_DELAY_MS = 250

/**
 * The design system's TooltipTrigger with a sane default delay.
 *
 * Import this rather than the design system's directly, so the delay is decided in one
 * place instead of being repeated at every call site — where it would inevitably be
 * forgotten and reintroduce the 1500ms behaviour on one icon.
 *
 * Every other prop passes straight through, including `delay` if a particular tooltip
 * genuinely needs a different one.
 */
const TooltipTrigger: FC<ComponentProps<typeof BcdsTooltipTrigger>> = ({
  delay = DEFAULT_DELAY_MS,
  ...props
}) => <BcdsTooltipTrigger delay={delay} {...props} />

export default TooltipTrigger
