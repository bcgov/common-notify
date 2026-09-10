import Papa from 'papaparse'

/**
 * Header the recipient's address goes under, as the design specifies and as the spreadsheet the
 * user downloads is labelled.
 *
 * The API expects this column to be called `to` and to come first, so `toMergeArray` renames it on
 * the way out. Keeping the translation here means the published API contract does not have to
 * change to match a UI label.
 */
export const RECIPIENT_COLUMN = 'email'

/** What the API calls the recipient column. */
const API_RECIPIENT_COLUMN = 'to'

/**
 * Row cap for a send started from this screen.
 *
 * The API accepts up to 50,000 (MAIL_MERGE_MAX_RECIPIENTS), but send limits are enforced per API
 * key and a browser send has no key. MailMergeUiLimitsGuard enforces the same number server-side.
 */
export const MAX_RECIPIENTS = 5000

/** Largest file the upload accepts. Checked in the browser - the API only ever sees parsed rows. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Cap on reported row issues so a badly-formed file cannot render an unbounded table. */
export const MAX_REPORTED_ISSUES = 100

/**
 * A problem with one cell, shown in the results table as Row / Column / Value found / Issue.
 */
export interface RowIssue {
  /** Row number as the spreadsheet shows it: the header is row 1, so the first recipient is row 2. */
  row: number
  column: string
  /** The offending cell, or undefined when it was empty. */
  value?: string
  issue: string
}

/**
 * A problem with the file as a whole - wrong columns, no rows, too many rows.
 *
 * These are reported inline under the upload control rather than in the table, because there is no
 * row to point at and because they invalidate every row at once.
 */
export type FileIssue = string

export interface ValidationResult {
  fileIssue: FileIssue | null
  rowIssues: RowIssue[]
}

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

// Deliberately permissive: the address is checked properly by the API before anything is sent.
// This only needs to catch the typos worth showing someone a row number for.
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

function isValidEmail(value: string): boolean {
  return value.length <= 254 && !value.includes('..') && EMAIL_PATTERN.test(value)
}

/**
 * Build the sample spreadsheet for a template: the recipient column followed by one column per
 * placeholder. Headers only - a pre-filled example row is one careless upload away from being
 * mailed to whoever it names.
 */
export function buildSampleCsv(placeholders: string[]): string {
  return Papa.unparse([[RECIPIENT_COLUMN, ...placeholders]])
}

/** Hand the sample spreadsheet to the browser as a download. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM is what makes Excel open a UTF-8 CSV with accented characters intact.
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Turn a template name into a filename that survives Windows, macOS and email attachment rules. */
export function csvFilenameFor(templateName: string): string {
  const slug =
    templateName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'template'
  return `${slug}-recipients.csv`
}

/**
 * Read a file to text, reporting progress as it goes.
 *
 * `File.text()` would be shorter but resolves in one step, which leaves the upload control with
 * nothing to show while a large file is read. FileReader emits real progress events, so the bar
 * reflects actual work rather than an animation.
 */
export function readFileWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }
    reader.onload = () => {
      onProgress(100)
      resolve(String(reader.result ?? ''))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))

    reader.readAsText(file)
  })
}

/**
 * Parse CSV text into headers and rows.
 *
 * Cells are trimmed: spreadsheet exports routinely carry trailing spaces, and a padded address or
 * placeholder value is never what the user meant.
 */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text.replace(/^\ufeff/, ''), { skipEmptyLines: 'greedy' })
  const [headers = [], ...rows] = result.data

  return {
    headers: headers.map((cell) => (cell ?? '').trim()),
    rows: rows.map((row) => row.map((cell) => (cell ?? '').trim())),
  }
}

/**
 * Check an uploaded file against the selected template.
 *
 * A file-level problem short-circuits: if the columns are wrong there is no point reporting the
 * same mistake once per row.
 */
export function validateCsv(parsed: ParsedCsv, placeholders: string[]): ValidationResult {
  const { headers, rows } = parsed
  const expected = [RECIPIENT_COLUMN, ...placeholders]

  if (headers.length === 0) {
    return {
      fileIssue: 'This file is empty. Download the sample CSV and fill it in.',
      rowIssues: [],
    }
  }

  for (const column of expected) {
    if (!headers.includes(column)) {
      return {
        fileIssue: `Your CSV file is missing required column called '${column}'.`,
        rowIssues: [],
      }
    }
  }

  const unexpected = headers.filter((header) => !expected.includes(header))
  if (unexpected.length > 0) {
    return {
      fileIssue: `Your CSV file has a column this template does not use: '${unexpected[0]}'.`,
      rowIssues: [],
    }
  }

  const duplicateHeader = headers.find((header, index) => headers.indexOf(header) !== index)
  if (duplicateHeader) {
    return {
      fileIssue: `Your CSV file has more than one column called '${duplicateHeader}'.`,
      rowIssues: [],
    }
  }

  if (rows.length === 0) {
    return { fileIssue: 'This file has no recipients. Add one row per person.', rowIssues: [] }
  }

  if (rows.length > MAX_RECIPIENTS) {
    return {
      fileIssue: `This file has ${rows.length.toLocaleString()} recipients. The limit is ${MAX_RECIPIENTS.toLocaleString()} per send.`,
      rowIssues: [],
    }
  }

  const recipientIndex = headers.indexOf(RECIPIENT_COLUMN)
  const rowIssues: RowIssue[] = []
  const firstSeenAt = new Map<string, number>()

  for (let index = 0; index < rows.length && rowIssues.length < MAX_REPORTED_ISSUES; index++) {
    const row = rows[index]
    const rowNumber = index + 2 // header occupies row 1

    for (let column = 0; column < headers.length; column++) {
      const value = row[column] ?? ''
      const name = headers[column]

      if (!value) {
        rowIssues.push({ row: rowNumber, column: name, issue: 'Missing or invalid value' })
        continue
      }

      if (column === recipientIndex) {
        if (!isValidEmail(value)) {
          rowIssues.push({ row: rowNumber, column: name, value, issue: 'Invalid format' })
          continue
        }

        const normalised = value.toLowerCase()
        const firstSeen = firstSeenAt.get(normalised)
        if (firstSeen !== undefined) {
          rowIssues.push({
            row: rowNumber,
            column: name,
            value,
            issue: `Duplicate of row ${firstSeen}`,
          })
        } else {
          firstSeenAt.set(normalised, rowNumber)
        }
      }
    }
  }

  return { fileIssue: null, rowIssues }
}

/**
 * The `mergeArray` the API expects: header row first, then one row per recipient, with the
 * recipient column renamed to `to` and moved to the front.
 */
export function toMergeArray(parsed: ParsedCsv): string[][] {
  const recipientIndex = parsed.headers.indexOf(RECIPIENT_COLUMN)
  const otherIndexes = parsed.headers.map((_, i) => i).filter((i) => i !== recipientIndex)
  const order = [recipientIndex, ...otherIndexes]

  return [
    [API_RECIPIENT_COLUMN, ...otherIndexes.map((i) => parsed.headers[i])],
    ...parsed.rows.map((row) => order.map((i) => row[i] ?? '')),
  ]
}

/** Keys that would reach Object.prototype if written blindly into a nested object. */
const UNSAFE_PARAM_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * The params for one row, keyed by placeholder name - used to render the preview.
 *
 * A dotted column becomes a nested object, the same shape the send path builds server-side from the
 * `mergeArray`: the renderer reads `{{alert.id}}` as a path, so a literal `"alert.id"` key would
 * never bind, and the personalisation check looks for the root key `alert`.
 */
export function rowParams(parsed: ParsedCsv, rowIndex: number): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const row = parsed.rows[rowIndex] ?? []

  parsed.headers.forEach((header, index) => {
    if (header !== RECIPIENT_COLUMN) {
      setParam(params, header, row[index] ?? '')
    }
  })

  return params
}

/** Write one cell into the params object, expanding a dotted column name into nested objects. */
function setParam(params: Record<string, unknown>, key: string, value: string): void {
  const segments = key.split('.')

  if (segments.some((segment) => !segment || UNSAFE_PARAM_SEGMENTS.has(segment))) {
    return
  }

  let target = params
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    const existing = target[segment]

    if (existing === undefined) {
      target[segment] = {}
    } else if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      return
    }

    target = target[segment] as Record<string, unknown>
  }

  const leaf = segments[segments.length - 1]
  if (!(leaf in target)) {
    target[leaf] = value
  }
}

/** The recipient address on one row, whichever column it sits in. */
export function rowRecipient(parsed: ParsedCsv, rowIndex: number): string {
  const recipientIndex = parsed.headers.indexOf(RECIPIENT_COLUMN)
  return parsed.rows[rowIndex]?.[recipientIndex] ?? ''
}
