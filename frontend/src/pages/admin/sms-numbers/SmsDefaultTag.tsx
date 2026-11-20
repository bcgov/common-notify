import type { FC } from 'react'
import { TagGroup, TagList } from '@bcgov/design-system-react-components'

/** Marks a number as its provider's default, in the design system's tag style. */
const SmsDefaultTag: FC = () => (
  <TagGroup aria-label="Default number">
    <TagList
      items={[
        {
          id: 'default',
          textValue: 'Default',
          color: 'bc-blue',
          tagStyle: 'circular',
          size: 'xsmall',
        },
      ]}
    />
  </TagGroup>
)

export default SmsDefaultTag
