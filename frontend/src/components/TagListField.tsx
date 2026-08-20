import { useState } from 'react'
import type { FC } from 'react'
import { TagGroup, TagList } from '@bcgov/design-system-react-components'
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
    <div className={`tag-list-field ${isDisabled ? 'tag-list-field--disabled' : ''}`}>
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

      {/* bcds TextArea cannot take a placeholder, so the input is a plain textarea styled to
          sit inside the bordered container above. */}
      <textarea
        className="tag-list-field__input"
        aria-label={ariaLabel}
        placeholder={placeholder}
        rows={2}
        value={draft}
        onChange={(changeEvent) => handleDraftChange(changeEvent.target.value)}
        onBlur={handleBlur}
        disabled={isDisabled}
      />
    </div>
  )
}

export default TagListField
