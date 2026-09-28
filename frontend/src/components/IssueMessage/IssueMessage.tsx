import type { FC, ReactNode } from 'react'
import '@/scss/components/issue-message.scss'

interface Props {
  /** Short label naming the problem, emphasised so a column of them stays scannable. */
  title: string
  /** What to do about it, shown under the title. */
  detail?: ReactNode
  className?: string
}

/**
 * One problem, stated as a short title with the fix beneath it.
 *
 * Both parts are always visible: a validation message the reader has to go looking for is a
 * message they will not read. Keep `detail` to a sentence - it sits in a table cell, and a
 * paragraph there pushes every other row out of view.
 */
const IssueMessage: FC<Props> = ({ title, detail, className }) => (
  <span className={`issue-message${className ? ` ${className}` : ''}`}>
    <strong className="issue-message__title">{title}</strong>
    {detail && <span className="issue-message__detail">{detail}</span>}
  </span>
)

export default IssueMessage
