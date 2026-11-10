import SearchIcon from '@mui/icons-material/Search'
import type { FC, ReactNode } from 'react'
import { TextField, Button } from '@bcgov/design-system-react-components'
import '@/scss/components/search-field.scss'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  placeholder?: string
  ariaLabel?: string
  children?: ReactNode
}

const SearchField: FC<SearchFieldProps> = ({
  value,
  onChange,
  onSearch,
  placeholder,
  ariaLabel = 'Search',
  children,
}) => {
  return (
    <div className="search-field">
      <div className="search-field__input">
        <TextField
          iconLeft={<SearchIcon fontSize="small" aria-hidden="true" />}
          size="medium"
          type="search"
          value={value}
          onChange={onChange}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          aria-label={ariaLabel}
          {...({ placeholder } as { placeholder?: string })}
        />
      </div>
      <Button variant="secondary" onClick={onSearch}>
        Search
      </Button>
      {children && <div className="search-field__actions">{children}</div>}
    </div>
  )
}

export default SearchField
