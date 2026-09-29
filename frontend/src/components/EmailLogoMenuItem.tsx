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
  <div
    id={optionId}
    role="option"
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
  </div>
)

export default EmailLogoMenuItem
