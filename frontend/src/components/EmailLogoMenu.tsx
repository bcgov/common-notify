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
  const listRef = useRef<HTMLDivElement>(null)
  const scrollActiveOption = useRef(true)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const labelId = `${id}-label`
  const valueId = `${id}-value`
  const listboxId = `${id}-listbox`
  const recommendedLabelId = `${id}-recommended-logos`
  const ministryLabelId = `${id}-ministry-logos`

  const logoOptions: EmailLogoMenuOption[] = logos.map((logo) => ({
    id: logo.id,
    name: logo.isDefault ? 'Main BC Mark (Default)' : (logo.name ?? 'Unnamed logo'),
    imageUrl: logo.imageUrl,
    isRecommended: logo.isDefault,
  }))
  const options: EmailLogoMenuOption[] = [
    ...logoOptions.filter((option) => option.isRecommended),
    ...logoOptions.filter((option) => !option.isRecommended),
  ]
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredOptions = options.filter((option) =>
    option.name.toLocaleLowerCase().includes(normalizedQuery),
  )
  const effectiveValue = value ?? logos.find((logo) => logo.isDefault)?.id
  const selectedOption = options.find((option) => option.id === effectiveValue) ?? {
    id: null,
    name: isLoading ? 'Loading logo...' : 'Unavailable logo',
  }
  const activeOptionId =
    activeIndex >= 0 && activeIndex < filteredOptions.length
      ? `${id}-option-${activeIndex}`
      : undefined
  const filteredRecommended = filteredOptions.filter(
    (option) => option.id !== null && option.isRecommended,
  )
  const filteredMinistries = filteredOptions.filter(
    (option) => option.id !== null && !option.isRecommended,
  )

  useEffect(() => {
    if (!isOpen || !activeOptionId || !scrollActiveOption.current) return
    const list = listRef.current
    const option = document.getElementById(activeOptionId)
    if (!list || !option || !list.contains(option)) return

    const bounds = list.getBoundingClientRect()
    const optionBounds = option.getBoundingClientRect()
    // Scroll only the dropdown, keeping the search input and page stationary.
    if (optionBounds.top < bounds.top) {
      list.scrollTop += optionBounds.top - bounds.top
    } else if (optionBounds.bottom > bounds.bottom) {
      list.scrollTop += optionBounds.bottom - bounds.bottom
    }
  }, [isOpen, activeOptionId, searchQuery])

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
    scrollActiveOption.current = true
    setSearchQuery('')
    const selectedIndex = options.findIndex((option) => option.id === effectiveValue)
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
      scrollActiveOption.current = true
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1))
    } else if (event.key === 'ArrowUp') {
      scrollActiveOption.current = true
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

  function renderLogoOption(option: EmailLogoMenuOption) {
    const optionIndex = filteredOptions.findIndex((item) => item.id === option.id)

    return (
      <EmailLogoMenuItem
        key={option.id}
        option={option}
        optionId={`${id}-option-${optionIndex}`}
        isActive={optionIndex === activeIndex}
        isSelected={option.id === effectiveValue}
        onActivate={() => {
          scrollActiveOption.current = false
          setActiveIndex(optionIndex)
        }}
        onSelect={() => selectOption(option)}
      />
    )
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
              {...({
                placeholder: 'Search logo...',
                role: 'combobox',
                // On the combobox, which holds focus — not the listbox, which never does.
                'aria-activedescendant': activeOptionId,
              } as {
                placeholder?: string
                role?: 'combobox'
                'aria-activedescendant'?: string
              })}
              value={searchQuery}
              onChange={(query) => {
                scrollActiveOption.current = true
                setSearchQuery(query)
                setActiveIndex(0)
              }}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <hr className="email-logo-menu__divider" />
          <div
            ref={listRef}
            id={listboxId}
            className="email-logo-menu__list"
            role="listbox"
            aria-label="Email logo options"
          >
            {filteredRecommended.length > 0 && (
              <div
                className="email-logo-menu__group"
                role="group"
                aria-labelledby={recommendedLabelId}
              >
                <div className="email-logo-menu__section-heading" id={recommendedLabelId}>
                  Recommended
                </div>
                {filteredRecommended.map(renderLogoOption)}
              </div>
            )}
            {filteredMinistries.length > 0 && (
              <>
                {filteredRecommended.length > 0 && <hr className="email-logo-menu__divider" />}
                <div
                  className="email-logo-menu__group"
                  role="group"
                  aria-labelledby={ministryLabelId}
                >
                  <div className="email-logo-menu__section-heading" id={ministryLabelId}>
                    Provincial Ministry Marks
                  </div>
                  {filteredMinistries.map(renderLogoOption)}
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
