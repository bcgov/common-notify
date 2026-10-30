import type { FC } from 'react'
import { Button, Callout, InlineAlert } from '@bcgov/design-system-react-components'
import FileUpload from '@/components/FileUpload'
import CsvIssuesTable from '@/pages/bulk-notifications/sections/CsvIssuesTable'
import type { CsvUpload } from '@/hooks/useCsvUpload'
import { MAX_FILE_BYTES } from '@/utils/bulkNotificationsCsv'
import type { ParsedCsv, RowIssue } from '@/utils/bulkNotificationsCsv'
import { MAX_TEST_RECIPIENTS } from '../utils/testSend'

interface EventsTestSendCsvUploadProps {
  csv: CsvUpload
  /** Only the first 5 rows of the csv are used */
  parsed: ParsedCsv | null
  /** Problems on the rows that were kept. */
  rowIssues: RowIssue[]
  isCsvReady: boolean
  missingFileError?: string
  onDownloadSample: () => void
  onFileChange: (file: File | null) => void
}

const EventsTestSendCsvUpload: FC<EventsTestSendCsvUploadProps> = ({
  csv,
  parsed,
  rowIssues,
  isCsvReady,
  missingFileError,
  onDownloadSample,
  onFileChange,
}) => (
  <>
    <div className="events__test-send-tip">
      <Callout
        variant="lightGrey"
        title="Tip"
        description={`Download the sample CSV to see the expected columns and format. Add the information needed for your template and upload the completed CSV below.\n\nOnly the first ${MAX_TEST_RECIPIENTS} recipients in the CSV will be processed.`}
      />
    </div>

    <div>
      <Button variant="secondary" onPress={onDownloadSample}>
        Download sample CSV
      </Button>
    </div>

    <FileUpload
      label="Upload CSV file"
      isRequired
      accept=".csv,text/csv"
      allowedExtensions={['.csv']}
      file={csv.file}
      onFileChange={onFileChange}
      maxSizeBytes={MAX_FILE_BYTES}
      progress={csv.readProgress}
      successMessage={csv.file && parsed ? 'File uploaded successfully' : undefined}
      errorMessage={csv.fileIssue ?? missingFileError}
      hint="Max file size: 5 MB"
    />

    <CsvIssuesTable issues={rowIssues} />

    {isCsvReady && (
      <InlineAlert
        variant="success"
        title="All required data passed validation."
        description="You can continue to the next step."
      />
    )}
  </>
)

export default EventsTestSendCsvUpload
