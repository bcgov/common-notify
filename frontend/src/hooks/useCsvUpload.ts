import { useCallback, useState } from 'react'
import {
  parseCsv,
  readFileWithProgress,
  validateCsv,
  type ParsedCsv,
  type RowIssue,
} from '@/utils/bulkNotificationsCsv'

export interface CsvUpload {
  /** The file the drop zone is showing, or null when there is nothing to review. */
  file: File | null
  /** 0-100 while reading, null when idle. Drives the upload progress bar. */
  readProgress: number | null
  /** Headers and rows of a file that passed the whole-file checks. */
  parsed: ParsedCsv | null
  /** A problem with the file as a whole: wrong columns, no rows, too many rows. */
  fileIssue: string | null
  /** Problems with individual cells. The file is kept so these can be reviewed row by row. */
  rowIssues: RowIssue[]
  /** Read, parse and check a newly chosen file. Pass null when the user clears the drop zone. */
  handleFileChange: (nextFile: File | null) => Promise<void>
  /** Back to nothing uploaded - a new template or tenant invalidates whatever was checked. */
  reset: () => void
  /** Report a whole-file problem the local checks did not catch, e.g. one the API found. */
  reportFileIssue: (issue: string) => void
}

/**
 * The read-parse-validate cycle for the recipient CSV, kept together because these five pieces of
 * state only ever change as a set.
 *
 * `placeholders` are the columns the template requires; they come from the API rather than from
 * parsing the template in the browser, so a file is always checked against what the server will
 * actually ask for.
 */
export function useCsvUpload(placeholders: string[]): CsvUpload {
  const [file, setFile] = useState<File | null>(null)
  const [readProgress, setReadProgress] = useState<number | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [fileIssue, setFileIssue] = useState<string | null>(null)
  const [rowIssues, setRowIssues] = useState<RowIssue[]>([])

  // Stable: it only calls setState setters, which React guarantees never change. Callers put it
  // in effect dependency arrays, and an identity that changed every render would re-fire them.
  const reset = useCallback(() => {
    setFile(null)
    setReadProgress(null)
    setParsed(null)
    setFileIssue(null)
    setRowIssues([])
  }, [])

  const handleFileChange = async (nextFile: File | null) => {
    setFile(nextFile)

    if (!nextFile) {
      setReadProgress(null)
      setParsed(null)
      setFileIssue(null)
      setRowIssues([])
      return
    }

    setReadProgress(0)
    try {
      const text = await readFileWithProgress(nextFile, setReadProgress)
      const nextParsed = parseCsv(text)
      const { fileIssue: nextFileIssue, rowIssues: nextRowIssues } = validateCsv(
        nextParsed,
        placeholders,
      )

      if (nextFileIssue) {
        // A file with the wrong shape is rejected outright, the way the design shows it: the drop
        // zone goes back to empty with the reason underneath. There is nothing to review row by
        // row, and keeping a "File uploaded successfully" chip next to a red error would contradict
        // itself. Row-level problems are different - that file is kept and reported in the table.
        setFile(null)
        setParsed(null)
        setRowIssues([])
        setFileIssue(nextFileIssue)
        return
      }

      setParsed(nextParsed)
      setFileIssue(null)
      setRowIssues(nextRowIssues)
    } catch {
      setFile(null)
      setParsed(null)
      setRowIssues([])
      setFileIssue('This file could not be read. Save it as a CSV and try again.')
    } finally {
      setReadProgress(100)
    }
  }

  return {
    file,
    readProgress,
    parsed,
    fileIssue,
    rowIssues,
    handleFileChange,
    reset,
    reportFileIssue: setFileIssue,
  }
}
