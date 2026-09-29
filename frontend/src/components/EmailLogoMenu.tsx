import { useEffect, useId, useRef, useState } from 'react'
import type { FC, KeyboardEvent } from 'react'
import {
  SvgChevronDownIcon,
  SvgChevronUpIcon,
  TextField,
} from '@bcgov/design-system-react-components'
import SearchIcon from '@mui/icons-material/Search'
import type { ApprovedEmailLogo } from '@/interfaces/tenant-settings.interface'
import EmailLogoMenuItem from './EmailLogoMenuItem'
import type { EmailLogoMenuOption } from './EmailLogoMenuItem'
import '@/scss/components/email-logo-menu.scss'

interface EmailLogoMenuProps {
  logos: ApprovedEmailLogo[]
  value: string | null
  onChange: (value: string | null) => void
  isDisabled?: boolean
  isLoading?: boolean
}

const NO_LOGO_OPTION: EmailLogoMenuOption = { id: null, name: 'No logo' }

const EmailLogoMenu: FC<EmailLogoMenuProps> = ({
  logos,
  value,
  onChange,
  isDisabled = false,
  isLoading = false,
}) => {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const labelId = `${id}-label`
  const valueId = `${id}-value`
  const listboxId = `${id}-listbox`
  const sectionLabelId = `${id}-approved-logos`

  const options: EmailLogoMenuOption[] = [
    NO_LOGO_OPTION,
    ...logos.map((logo) => ({
      id: logo.id,
      name: logo.name ?? 'Unnamed logo',
      imageUrl: logo.imageUrl,
    })),
  ]
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredOptions = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(normalizedQuery),
  )
  const selectedOption =
    options.find((option) => option.id === value) ??
    (value ? { id: value, name: isLoading ? 'Loading logo…' : 'Unavailable logo' } : NO_LOGO_OPTION)
  const activeOptionId =
    activeIndex >= 0 && activeIndex < filteredOptions.length
      ? `${id}-option-${activeIndex}`
      : undefined
  const showsNoLogo = filteredOptions.some((option) => option.id === null)
  const filteredLogos = filteredOptions.filter((option) => option.id !== null)

  useEffect(() => {
    if (!isOpen) return

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [isOpen])

  function openMenu() {
    if (isDisabled) return
    setSearchQuery('')
    const selectedIndex = options.findIndex((option) => option.id === value)
    setActiveIndex(Math.max(0, selectedIndex))
    setIsOpen(true)
  }

  function closeMenu(restoreFocus: boolean) {
    setIsOpen(false)
    setSearchQuery('')
    if (restoreFocus) triggerRef.current?.focus()
  }

  function selectOption(option: EmailLogoMenuOption) {
    onChange(option.id)
    closeMenu(true)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filteredOptions[activeIndex]
      if (option) selectOption(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
    } else if (event.key === 'Tab') {
      closeMenu(false)
    }
  }

  return (
    <div className="email-logo-menu" ref={rootRef}>
      <span className="email-logo-menu__label" id={labelId}>
        Email logo/brand
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="email-logo-menu__trigger"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        disabled={isDisabled}
        onClick={() => (isOpen ? closeMenu(true) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openMenu()
          }
        }}
      >
        {selectedOption.imageUrl && (
          <img alt="" className="email-logo-menu__trigger-image" src={selectedOption.imageUrl} />
        )}
        <span className="email-logo-menu__trigger-name" id={valueId}>
          {selectedOption.name}
        </span>
        <span className="email-logo-menu__chevron" aria-hidden="true">
          {isOpen ? <SvgChevronUpIcon /> : <SvgChevronDownIcon />}
        </span>
      </button>

      {isOpen && (
        <div className="email-logo-menu__panel">
          <div className="email-logo-menu__search">
            <TextField
              aria-label="Search email logos"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded="true"
              aria-activedescendant={activeOptionId}
              autoFocus
              iconLeft={<SearchIcon fontSize="small" aria-hidden="true" />}
              size="medium"
              type="text"
              {...({ placeholder: 'Search logos', role: 'combobox' } as {
                placeholder?: string
                role?: 'combobox'
              })}
              value={searchQuery}
              onChange={(query) => {
                setSearchQuery(query)
                setActiveIndex(0)
              }}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <div className="email-logo-menu__divider" role="separator" />
          <div
            id={listboxId}
            className="email-logo-menu__list"
            role="listbox"
            aria-label="Email logo options"
            aria-activedescendant={activeOptionId}
          >
            {showsNoLogo && (
              <EmailLogoMenuItem
                option={NO_LOGO_OPTION}
                optionId={`${id}-option-${filteredOptions.findIndex((option) => option.id === null)}`}
                isActive={filteredOptions.findIndex((option) => option.id === null) === activeIndex}
                isSelected={value === null}
                onActivate={() =>
                  setActiveIndex(filteredOptions.findIndex((option) => option.id === null))
                }
                onSelect={() => selectOption(NO_LOGO_OPTION)}
              />
            )}
            {filteredLogos.length > 0 && (
              <>
                {showsNoLogo && <div className="email-logo-menu__divider" role="separator" />}
                <div
                  className="email-logo-menu__group"
                  role="group"
                  aria-labelledby={sectionLabelId}
                >
                  <div className="email-logo-menu__section-heading" id={sectionLabelId}>
                    Approved logos
                  </div>
                  {filteredLogos.map((option) => {
                    const optionIndex = filteredOptions.findIndex((item) => item.id === option.id)
                    return (
                      <EmailLogoMenuItem
                        key={option.id}
                        option={option}
                        optionId={`${id}-option-${optionIndex}`}
                        isActive={optionIndex === activeIndex}
                        isSelected={option.id === value}
                        onActivate={() => setActiveIndex(optionIndex)}
                        onSelect={() => selectOption(option)}
                      />
                    )
                  })}
                </div>
              </>
            )}
          </div>
          {filteredOptions.length === 0 && (
            <p className="email-logo-menu__empty" role="status">
              No logos match your search.
            </p>
          )}
          {logos.length === 0 && !normalizedQuery && (
            <p className="email-logo-menu__empty" role="status">
              No approved logos available.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default EmailLogoMenu
