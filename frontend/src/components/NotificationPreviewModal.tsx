import type { FC, ReactNode } from 'react'
import {
  Dialog,
  Modal,
  ProgressCircle,
  SvgChevronLeftIcon,
  SvgChevronRightIcon,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@bcgov/design-system-react-components'
import '@/scss/components/notification-preview.scss'

export type PreviewVariableType = 'text' | 'boolean'

export interface PreviewVariable {
  name: string
  value: string
  type: PreviewVariableType
  /** Marks the field invalid; only meaningful when the list is editable. */
  isInvalid?: boolean
  errorMessage?: string
}

export interface PreviewStepper {
  /** e.g. "Email notification 1 of 63" */
  label: string
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
}

interface NotificationPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  title: string

  /** Left pane: the values the body is rendered from. */
  variables: PreviewVariable[]
  variablesIntro: string
  /** When false the values are shown as read-only - they came from somewhere else, e.g. a CSV row. */
  isEditable?: boolean
  onVariableChange?: (name: string, value: string) => void
  /** Control under the variable list, such as "Apply to Preview". */
  variablesFooter?: ReactNode
  stepper?: PreviewStepper

  /** Right pane: the message as it will be delivered. */
  from?: string
  to?: string
  subject?: string
  /** Rendered HTML body. When absent, `bodyText` is shown as plain text instead. */
  bodyHtml?: string
  bodyText?: string
  /** Replaces the rendered output entirely, e.g. a raw-template tab or an "unavailable" notice. */
  bodyOverride?: ReactNode
  /** Control above the output, such as a Rendered/Raw toggle. */
  outputHeader?: ReactNode
  isLoading?: boolean
  error?: string | null

  /** Primary action in the modal footer, such as "Send notification (63)". */
  footer?: ReactNode
}

/**
 * Shared preview shell: the values on the left, the message as it will be delivered on the right.
 *
 * Used by both the template editor and the bulk send screen, which differ only in where the values
 * come from (typed in, or read off a spreadsheet row) and what the footer does.
 */
const NotificationPreviewModal: FC<NotificationPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  variables,
  variablesIntro,
  isEditable = false,
  onVariableChange,
  variablesFooter,
  stepper,
  from,
  to,
  subject,
  bodyHtml,
  bodyText,
  bodyOverride,
  outputHeader,
  isLoading = false,
  error = null,
  footer,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog aria-labelledby="notification-preview-title">
        <div className="notification-preview">
          <div className="notification-preview__header">
            <h5 className="notification-preview__title" id="notification-preview-title">
              {title}
            </h5>
          </div>

          <div className="notification-preview__body">
            <div className="notification-preview__data">
              {stepper && (
                <div className="notification-preview__stepper">
                  <span className="notification-preview__position" aria-live="polite">
                    {stepper.label}
                  </span>
                  <button
                    type="button"
                    className="notification-preview__nav"
                    onClick={stepper.onPrevious}
                    disabled={!stepper.hasPrevious}
                    aria-label="Previous"
                  >
                    <SvgChevronLeftIcon />
                  </button>
                  <button
                    type="button"
                    className="notification-preview__nav"
                    onClick={stepper.onNext}
                    disabled={!stepper.hasNext}
                    aria-label="Next"
                  >
                    <SvgChevronRightIcon />
                  </button>
                </div>
              )}

              <h6 className="notification-preview__heading">Preview data</h6>
              <p className="notification-preview__intro">{variablesIntro}</p>

              {variables.length === 0 ? (
                <p className="notification-preview__intro">No variables found.</p>
              ) : (
                <div className="notification-preview__fields">
                  {variables.map((variable) =>
                    variable.type === 'boolean' ? (
                      // A True/False pair rather than a switch: the value is one of two named
                      // states the template branches on, and it reads the same whether the field is
                      // editable here or fixed by a spreadsheet row.
                      <div key={variable.name} className="notification-preview__field-toggle">
                        <ToggleButtonGroup
                          label={variable.name}
                          size="small"
                          selectionMode="single"
                          disallowEmptySelection
                          selectedKeys={[variable.value === 'true' ? 'true' : 'false']}
                          isDisabled={!isEditable}
                          onSelectionChange={(keys) => {
                            const [selected] = keys
                            if (selected != null) {
                              onVariableChange?.(variable.name, String(selected))
                            }
                          }}
                        >
                          <ToggleButton id="true" size="small">
                            True
                          </ToggleButton>
                          <ToggleButton id="false" size="small">
                            False
                          </ToggleButton>
                        </ToggleButtonGroup>
                      </div>
                    ) : (
                      // Wrap rather than pass `className`: the design system spreads props over its
                      // own class, so a className here would strip it and break the invalid state.
                      <div key={variable.name} className="notification-preview__field-text">
                        <TextField
                          label={variable.name}
                          value={variable.value}
                          onChange={(value) => onVariableChange?.(variable.name, value)}
                          isReadOnly={!isEditable}
                          isRequired={isEditable}
                          isInvalid={variable.isInvalid}
                          errorMessage={variable.errorMessage}
                        />
                      </div>
                    ),
                  )}
                </div>
              )}

              {variablesFooter && (
                <div className="notification-preview__data-footer">{variablesFooter}</div>
              )}
            </div>

            <div className="notification-preview__output-pane">
              {(from || to || subject) && (
                <dl className="notification-preview__envelope">
                  {from && (
                    <div className="notification-preview__envelope-row">
                      <dt>From:</dt>
                      <dd>{from}</dd>
                    </div>
                  )}
                  {to && (
                    <div className="notification-preview__envelope-row">
                      <dt>To:</dt>
                      <dd>{to}</dd>
                    </div>
                  )}
                  {subject && (
                    <div className="notification-preview__envelope-row">
                      <dt>Subject line:</dt>
                      <dd>{subject}</dd>
                    </div>
                  )}
                </dl>
              )}

              {outputHeader}

              {bodyOverride ? (
                bodyOverride
              ) : error ? (
                <p className="notification-preview__error">{error}</p>
              ) : isLoading ? (
                // Indeterminate: a render is a single request with no measurable progress, so a
                // percentage would be invented.
                <div className="notification-preview__loading">
                  <ProgressCircle isIndeterminate aria-label="Rendering preview" size="medium" />
                  <p className="notification-preview__placeholder">Rendering preview...</p>
                </div>
              ) : bodyHtml !== undefined ? (
                // A sandboxed iframe with no allow-* tokens: the template is tenant-authored, so
                // its markup runs with no script, no forms and no access to this document, and its
                // styles cannot leak into the app.
                <iframe
                  className="notification-preview__frame"
                  title="Rendered email"
                  sandbox=""
                  srcDoc={bodyHtml}
                />
              ) : (
                <pre className="notification-preview__text">{bodyText}</pre>
              )}
            </div>
          </div>

          {footer && <div className="notification-preview__footer">{footer}</div>}
        </div>
      </Dialog>
    </Modal>
  )
}

export default NotificationPreviewModal
