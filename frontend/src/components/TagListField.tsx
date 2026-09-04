import { useState } from 'react'
import type { FC } from 'react'
import {
  SvgExclamationIcon,
  TagGroup,
  TagList,
  TextArea,
} from '@bcgov/design-system-react-components'
import '@/scss/components/tag-list-field.scss'

/** Appends values to a list, dropping blanks and ones already entered */
function withValues(values: string[], additions: string[]): string[] {
  return additions.reduce(
    (result, value) => (value && !result.includes(value) ? [...result, value] : result),
    values,
  )
}

export interface TagListFieldProps {
  values: string[]
  onChange: (values: string[]) => void
  'aria-label': string
  placeholder?: string
  isDisabled?: boolean
  /** Validation is the caller's responsibility; this only controls how the field is displayed. */
  isInvalid?: boolean
  errorMessage?: string
}

/**
 * A multi-value tag input: already-entered values render as removable tags, new ones are typed
 * into a text area and committed as tags.
 *
 * bcds has no tag input, so this is a TagGroup and a TextArea sharing one bordered container.
 * Values are delimited by whitespace: typing a space or newline commits what came before it as a tag.
 */
const TagListField: FC<TagListFieldProps> = ({
  values,
  onChange,
  'aria-label': ariaLabel,
  placeholder,
  isDisabled = false,
  isInvalid = false,
  errorMessage,
}) => {
  // What is currently typed, before a space turns it into a tag.
  const [draft, setDraft] = useState('')

  function handleDraftChange(text: string) {
    // Everything before the final space is complete; what follows is still being typed.
    const parts = text.split(/\s+/)
    const next = parts.pop() ?? ''
    onChange(withValues(values, parts))
    setDraft(next)
  }

  // Leaving the field commits the value being typed, so it is not lost without a space.
  function handleBlur() {
    const trimmed = draft.trim()
    if (trimmed) {
      onChange(withValues(values, [trimmed]))
      setDraft('')
    }
  }

  return (
    <>
      <div
        className={`tag-list-field ${isDisabled ? 'tag-list-field--disabled' : ''} ${
          isInvalid ? 'tag-list-field--invalid' : ''
        }`}
      >
        {values.length > 0 && (
          <TagGroup
            aria-label={ariaLabel}
            onRemove={(keys) => onChange(values.filter((value) => !keys.has(value)))}
          >
            <TagList
              items={values.map((value) => ({
                id: value,
                textValue: value,
                size: 'xsmall',
                tagStyle: 'circular',
                ...(isDisabled && { isDisabled: true }),
              }))}
            />
          </TagGroup>
        )}

        {/* Not passing `className`: the DS spreads props over its own
            `bcds-react-aria-TextArea` class, so a className here would strip it. The
            `.tag-list-field` styles target the DS's own class names instead to blend
            this into the bordered container above. */}
        <TextArea
          aria-label={ariaLabel}
          value={draft}
          onChange={handleDraftChange}
          onBlur={handleBlur}
          isDisabled={isDisabled}
          isInvalid={isInvalid}
          errorMessage={errorMessage}
          // The DS TextArea omits `placeholder` and `rows` from its types, but
          // react-aria's useTextField still forwards them to the input.
          {...({ placeholder, rows: 2 } as { placeholder?: string; rows?: number })}
        />
      </div>

      {/* The DS renders its own error line inside the bordered container above (hidden via
          CSS below); this is the visible copy, placed outside it. Marked aria-hidden since
          the hidden DS copy already wires the accessible description via aria-describedby. */}
      {isInvalid && errorMessage && (
        <div className="tag-list-field__error" aria-hidden="true">
          <SvgExclamationIcon />
          {errorMessage}
        </div>
      )}
    </>
  )
}

export default TagListField
