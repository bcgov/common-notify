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
          iconLeft={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M16.4479 16.2956C16.7213 16.569 16.7213 16.9792 16.4479 17.2253C16.3385 17.362 16.1745 17.4167 16.0104 17.4167C15.819 17.4167 15.6549 17.362 15.5182 17.2253L11.8541 13.5612C10.8698 14.3542 9.63928 14.7917 8.32678 14.7917C5.2096 14.7917 2.66663 12.2487 2.66663 9.10413C2.66663 5.98694 5.18225 3.41663 8.32678 3.41663C11.444 3.41663 14.0143 5.98694 14.0143 9.10413C14.0143 10.444 13.5768 11.6744 12.7838 12.6315L16.4479 16.2956ZM3.97913 9.10413C3.97913 11.5377 5.92053 13.4792 8.35413 13.4792C10.7604 13.4792 12.7292 11.5377 12.7292 9.10413C12.7292 6.69788 10.7604 4.72913 8.35413 4.72913C5.92053 4.72913 3.97913 6.69788 3.97913 9.10413Z"
                fill="#2D2D2D"
              />
            </svg>
          }
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
