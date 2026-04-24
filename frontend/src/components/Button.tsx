import type { ComponentProps, ReactNode } from 'react'
import { Button as BcButton } from '@bcgov/design-system-react-components'

/**
 * Infer exact props from design system component.
 * Ensures we stay aligned with upstream changes.
 */
type BcButtonProps = ComponentProps<typeof BcButton>

/**
 * App-level Button wrapper around BCGov Design System.
 *
 * Normalizes API to prevent react-aria leakage:
 * - `disabled` (standard HTML) → `isDisabled` (react-aria)
 * - `onClick` (standard React) → `onPress` (react-aria)
 *
 * @example
 * <Button onClick={handleSubmit}>
 *   Submit
 * </Button>
 *
 * @example
 * <Button variant="secondary" disabled>
 *   Cancel
 * </Button>
 *
 * @example
 * <Button danger>Delete Account</Button>
 */
export interface ButtonProps extends Omit<BcButtonProps, 'isDisabled' | 'onPress' | 'children'> {
  /** Button content */
  children: ReactNode

  /** Standard HTML-style disabled prop (normalized) */
  disabled?: boolean

  /** Click handler (normalized to simple event model) */
  onClick?: () => void
}

/**
 * Production-safe Button wrapper
 *
 * Responsibilities:
 * - Normalize API (disabled → isDisabled, onClick → onPress)
 * - Keep design system behavior intact
 * - Prevent leaking internal react-aria APIs
 */
export function Button({ children, disabled, onClick, ...rest }: ButtonProps) {
  return (
    <BcButton {...rest} isDisabled={disabled} onPress={onClick}>
      {children}
    </BcButton>
  )
}

export default Button
