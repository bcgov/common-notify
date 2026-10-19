import type { FC } from 'react'
import { SvgCheckIcon } from '@bcgov/design-system-react-components'

export interface EmailLogoMenuOption {
  id: string | null
  name: string
  imageUrl?: string
  isRecommended?: boolean
}

interface EmailLogoMenuItemProps {
  option: EmailLogoMenuOption
  optionId: string
  isActive: boolean
  isSelected: boolean
  onActivate: () => void
  onSelect: () => void
}

const EmailLogoMenuItem: FC<EmailLogoMenuItemProps> = ({
  option,
  optionId,
  isActive,
  isSelected,
  onActivate,
  onSelect,
}) => (
  // A button, not a div: focus stays on the combobox input (aria-activedescendant), so this is
  // only focusable programmatically (tabIndex -1), but it still answers Enter and Space natively.
  <button
    type="button"
    id={optionId}
    role="option"
    tabIndex={-1}
    aria-label={option.name}
    aria-selected={isSelected}
    className={`email-logo-menu__option${isActive ? ' email-logo-menu__option--active' : ''}${
      isSelected ? ' email-logo-menu__option--selected' : ''
    }${option.imageUrl ? '' : ' email-logo-menu__option--no-image'}`}
    onClick={onSelect}
    onMouseMove={onActivate}
  >
    {option.imageUrl && (
      <img alt="" className="email-logo-menu__option-image" src={option.imageUrl} />
    )}
    <span className="email-logo-menu__option-name">{option.name}</span>
    {isSelected && (
      <span className="email-logo-menu__check" aria-hidden="true">
        <SvgCheckIcon />
      </span>
    )}
  </button>
)

export default EmailLogoMenuItem
