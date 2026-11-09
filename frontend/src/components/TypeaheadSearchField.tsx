import { useMemo } from 'react'
import type { FC, KeyboardEvent } from 'react'
import { ComboBox, Input, ListBox, ListBoxItem, Popover } from 'react-aria-components'
import { Button } from '@bcgov/design-system-react-components'
import SearchIcon from '@mui/icons-material/Search'
import '@/scss/components/search-field.scss'
import '@/scss/components/typeahead-search-field.scss'

const DEFAULT_MAX_SUGGESTIONS = 8

interface TypeaheadSearchFieldProps {
  value: string
  onChange: (value: string) => void
  /** Called with the term to search for: the typed text, or a suggestion once picked. */
  onSearch: (term: string) => void
  /** Values to suggest as the user types, matched anywhere in the text, ignoring case. */
  suggestions: readonly string[]
  ariaLabel: string
  placeholder?: string
  maxSuggestions?: number
}

/**
 * SearchField with suggestions: typing lists the matching values, and picking one searches for
 * it. Free text still searches on Enter or the Search button, so a partial name finds every
 * tenant containing it.
 */
const TypeaheadSearchField: FC<TypeaheadSearchFieldProps> = ({
  value,
  onChange,
  onSearch,
  suggestions,
  ariaLabel,
  placeholder,
  maxSuggestions = DEFAULT_MAX_SUGGESTIONS,
}) => {
  const matches = useMemo(() => {
    const query = value.trim().toLocaleLowerCase()
    if (!query) return []
    return [...new Set(suggestions)]
      .filter((suggestion) => suggestion.toLocaleLowerCase().includes(query))
      .slice(0, maxSuggestions)
      .map((suggestion) => ({ id: suggestion }))
  }, [value, suggestions, maxSuggestions])

  // Enter on a highlighted suggestion picks it, which searches through onSelectionChange; only
  // Enter on the text itself searches here. The highlighted option is the input's
  // aria-activedescendant.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.currentTarget.getAttribute('aria-activedescendant')) {
      onSearch(value)
    }
  }

  return (
    <div className="search-field">
      <div className="search-field__input">
        <ComboBox
          className="typeahead-search-field"
          aria-label={ariaLabel}
          items={matches}
          inputValue={value}
          onInputChange={onChange}
          // Never holds a selection: a pick only fills the text and searches, so editing the
          // text afterwards is ordinary typing.
          selectedKey={null}
          onSelectionChange={(key) => {
            if (key === null) return
            onChange(String(key))
            onSearch(String(key))
          }}
          allowsCustomValue
          menuTrigger="input"
        >
          <div className="typeahead-search-field__control">
            <SearchIcon fontSize="small" aria-hidden="true" />
            <Input
              className="typeahead-search-field__input"
              placeholder={placeholder}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Popover className="typeahead-search-field__popover" placement="bottom start" offset={4}>
            <ListBox className="typeahead-search-field__list">
              {(item: { id: string }) => (
                <ListBoxItem id={item.id} className="typeahead-search-field__option">
                  {item.id}
                </ListBoxItem>
              )}
            </ListBox>
          </Popover>
        </ComboBox>
      </div>
      <Button variant="secondary" onPress={() => onSearch(value)}>
        Search
      </Button>
    </div>
  )
}

export default TypeaheadSearchField
