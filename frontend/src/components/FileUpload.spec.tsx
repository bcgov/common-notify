import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileUpload from './FileUpload'

function renderUpload(overrides: Partial<Parameters<typeof FileUpload>[0]> = {}) {
  const onFileChange = vi.fn()
  render(
    <FileUpload
      label="Recipient list"
      accept=".csv,text/csv"
      allowedExtensions={['.csv']}
      file={null}
      onFileChange={onFileChange}
      hint="CSV only."
      {...overrides}
    />,
  )
  return { onFileChange }
}

describe('FileUpload', () => {
  it('associates the label and hint with the file input', () => {
    renderUpload()

    const input = screen.getByLabelText('Recipient list')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAccessibleDescription('CSV only.')
  })

  it('passes a chosen file to the caller', async () => {
    const { onFileChange } = renderUpload()
    const file = new File(['to\n'], 'recipients.csv', { type: 'text/csv' })

    await userEvent.upload(screen.getByLabelText('Recipient list'), file)

    expect(onFileChange).toHaveBeenCalledWith(file)
  })

  // The native picker filters on `accept`, but a drop does not - so the guard only ever fires here.
  it('rejects a dropped file with the wrong extension and explains why', () => {
    const { onFileChange } = renderUpload()
    const file = new File(['nope'], 'recipients.txt', { type: 'text/plain' })

    fireEvent.drop(screen.getByText('Choose a file or drag and drop here'), {
      dataTransfer: { files: [file] },
    })

    expect(onFileChange).toHaveBeenCalledWith(null)
    expect(screen.getByRole('alert')).toHaveTextContent('is not a .csv file')
  })

  it('accepts a dropped CSV', () => {
    const { onFileChange } = renderUpload()
    const file = new File(['to\n'], 'recipients.csv', { type: 'text/csv' })

    fireEvent.drop(screen.getByText('Choose a file or drag and drop here'), {
      dataTransfer: { files: [file] },
    })

    expect(onFileChange).toHaveBeenCalledWith(file)
  })

  it('rejects a file over the size limit and says how big it was', async () => {
    const { onFileChange } = renderUpload({ maxSizeBytes: 1024 })
    const file = new File(['x'.repeat(2048)], 'recipients.csv', { type: 'text/csv' })

    await userEvent.upload(screen.getByLabelText('Recipient list'), file)

    expect(onFileChange).toHaveBeenCalledWith(null)
    expect(screen.getByRole('alert')).toHaveTextContent('is 2.00 KB. The limit is 1.00 KB.')
  })

  it('accepts a file at exactly the size limit', async () => {
    const { onFileChange } = renderUpload({ maxSizeBytes: 1024 })
    const file = new File(['x'.repeat(1024)], 'recipients.csv', { type: 'text/csv' })

    await userEvent.upload(screen.getByLabelText('Recipient list'), file)

    expect(onFileChange).toHaveBeenCalledWith(file)
  })

  it('replaces the drop prompt with the chosen file and lets it be removed', async () => {
    const file = new File(['email\n'], 'recipients.csv', { type: 'text/csv' })
    const { onFileChange } = renderUpload({ file })

    expect(screen.getByText('recipients.csv')).toBeInTheDocument()
    expect(screen.queryByText('Choose a file or drag and drop here')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove recipients.csv' }))

    expect(onFileChange).toHaveBeenCalledWith(null)
  })

  it('reports read progress while the file is being read', () => {
    const file = new File(['email\n'], 'recipients.csv', { type: 'text/csv' })
    renderUpload({ file, progress: 25 })

    expect(screen.getByText('Uploading...')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Reading recipients.csv' })).toHaveValue(25)
    // Removing mid-read would leave the reader writing into state for a file that is gone.
    expect(screen.getByRole('button', { name: 'Remove recipients.csv' })).toBeDisabled()
  })

  it('confirms success once the read has finished', () => {
    const file = new File(['email\n'], 'recipients.csv', { type: 'text/csv' })
    renderUpload({ file, progress: 100, successMessage: 'File uploaded successfully' })

    expect(screen.queryByText('Uploading...')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('File uploaded successfully')
  })

  it('shows a file-level error passed by the page', () => {
    renderUpload({ errorMessage: 'A CSV file is required to continue.' })

    expect(screen.getByRole('alert')).toHaveTextContent('A CSV file is required to continue.')
  })

  it('disables the input when the screen is not ready for a file', () => {
    renderUpload({ isDisabled: true })

    expect(screen.getByLabelText('Recipient list')).toBeDisabled()
  })
})
