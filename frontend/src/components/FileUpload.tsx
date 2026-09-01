import { useId, useRef, useState } from 'react'
import type { DragEvent, FC } from 'react'
import { Button, SvgCheckCircleIcon } from '@bcgov/design-system-react-components'
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined'
import '@/scss/components/file-upload.scss'

interface FileUploadProps {
  label: string
  /** Passed straight to the native input, e.g. '.csv,text/csv'. */
  accept: string
  /** Extensions the drop zone will take, lower-case and dotted - drag and drop ignores `accept`. */
  allowedExtensions: string[]
  file: File | null
  onFileChange: (file: File | null) => void
  /** Largest file the caller will accept, in bytes. Rejected files are reported, not silently dropped. */
  maxSizeBytes?: number
  /** Appends "(required)" to the label, matching how the design system renders a required field. */
  isRequired?: boolean
  /** 0-100 while the file is being read. Omit once reading has finished. */
  progress?: number | null
  /** Shown in green under the file once it has been read successfully. */
  successMessage?: string
  /** Shown in red under the control - a problem with the file rather than with one row. */
  errorMessage?: string
  /** Note under the control, e.g. the size limit. */
  hint?: string
  isDisabled?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * File picker with a drop zone, for the file types a screen names in `accept`.
 *
 * The design system has no file input, so this is hand-rolled: a real `<input type="file">` stays
 * in the markup (visually hidden, still focusable and still the thing screen readers announce) and
 * the visible control is its label. Once a file is chosen the drop zone is replaced by a chip
 * naming it, so the control always shows its current state rather than an empty invitation.
 */
const FileUpload: FC<FileUploadProps> = ({
  label,
  accept,
  allowedExtensions,
  file,
  onFileChange,
  maxSizeBytes,
  isRequired = false,
  progress = null,
  successMessage,
  errorMessage,
  hint,
  isDisabled = false,
}) => {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)

  const isReading = progress !== null && progress < 100

  const accepts = (candidate: File) =>
    allowedExtensions.some((extension) => candidate.name.toLowerCase().endsWith(extension))

  const select = (candidate: File | null) => {
    if (candidate && !accepts(candidate)) {
      setRejected(`"${candidate.name}" is not a ${allowedExtensions.join(' or ')} file.`)
      onFileChange(null)
      return
    }
    if (candidate && maxSizeBytes !== undefined && candidate.size > maxSizeBytes) {
      setRejected(
        `"${candidate.name}" is ${formatSize(candidate.size)}. The limit is ${formatSize(maxSizeBytes)}.`,
      )
      onFileChange(null)
      return
    }
    setRejected(null)
    onFileChange(candidate)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (isDisabled) return
    select(event.dataTransfer.files?.[0] ?? null)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!isDisabled) setIsDragging(true)
  }

  const clear = () => {
    setRejected(null)
    onFileChange(null)
    // The input keeps its value after a pick, so re-selecting the same file would not fire onChange.
    if (inputRef.current) inputRef.current.value = ''
  }

  const inlineError = rejected ?? errorMessage

  return (
    <div className="file-upload">
      <span className="file-upload__label" id={`${inputId}-label`}>
        {isRequired ? `${label} (required)` : label}
      </span>

      <div
        className={`file-upload__zone${isDragging ? ' file-upload__zone--dragging' : ''}${
          isDisabled ? ' file-upload__zone--disabled' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
      >
        {/* The input stays mounted in both states so focus and the accessible name survive a pick. */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          disabled={isDisabled}
          className="file-upload__input visually-hidden"
          aria-labelledby={`${inputId}-label`}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => select(event.target.files?.[0] ?? null)}
        />

        {file ? (
          <div className="file-upload__selected">
            <div className="file-upload__chip">
              <UploadFileOutlinedIcon className="file-upload__file-icon" aria-hidden="true" />
              <span className="file-upload__file-meta">
                <span className="file-upload__file-name">{file.name}</span>
                <span className="file-upload__file-size">{formatSize(file.size)}</span>
              </span>
              <Button
                variant="link"
                size="small"
                onPress={clear}
                aria-label={`Remove ${file.name}`}
                isDisabled={isReading}
              >
                Remove
              </Button>
            </div>

            {isReading ? (
              <div className="file-upload__progress">
                <div className="file-upload__progress-row">
                  <span>Uploading...</span>
                  <span>{progress}%</span>
                </div>
                <progress
                  className="file-upload__progress-bar"
                  value={progress ?? 0}
                  max={100}
                  aria-label={`Reading ${file.name}`}
                />
              </div>
            ) : (
              successMessage && (
                <p className="file-upload__success" role="status">
                  {/* The design system's own circle-check, which inherits the success colour via
                      currentColor. The id is scoped so two uploads on a page cannot collide. */}
                  <SvgCheckCircleIcon id={`${inputId}-success-icon`} />
                  {successMessage}
                </p>
              )
            )}
          </div>
        ) : (
          <div className="file-upload__prompt">
            <UploadFileOutlinedIcon className="file-upload__prompt-icon" aria-hidden="true" />
            <p className="file-upload__prompt-text">Choose a file or drag and drop here</p>
            <p className="file-upload__prompt-types">({allowedExtensions.join(', ')})</p>
            <label htmlFor={inputId} className="file-upload__browse">
              Browse file
            </label>
          </div>
        )}
      </div>

      {hint && (
        <p className="file-upload__hint" id={hintId}>
          {hint}
        </p>
      )}

      {inlineError && (
        <p className="file-upload__error" role="alert">
          {inlineError}
        </p>
      )}
    </div>
  )
}

export default FileUpload
