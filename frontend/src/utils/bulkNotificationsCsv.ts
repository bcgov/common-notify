import Papa from 'papaparse'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

/**
 * Header the recipient's address goes under, as the design specifies and as the spreadsheet the
 * user downloads is labelled.
 *
 * The API expects this column to be called `to` and to come first, so `toMergeArray` renames it on
 * the way out. Keeping the translation here means the published API contract does not have to
 * change to match a UI label.
 */
export type BulkChannel = 'email' | 'sms'

/** The column a channel's recipients go under, as the downloaded sample CSV labels it. */
export const RECIPIENT_COLUMN: Record<BulkChannel, string> = {
  email: 'email',
  sms: 'phone',
}

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
 *
 * The issue is split in two: `title` names the problem, `detail` says how to fix it. Both are
 * shown, the title above the detail, so keep the detail to a sentence - it sits in a table cell.
 */
export interface RowIssue {
  /** Row number as the spreadsheet shows it: the header is row 1, so the first recipient is row 2. */
  row: number
  column: string
  /** The offending cell, or undefined when it was empty. */
  value?: string
  /** Short label naming the problem. */
  title: string
  /** One sentence on how to fix it, shown under the title. */
  detail: string
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
 * Validate the whole input, assuming Canada for national numbers as the API does.
 * Destination support is checked separately so it gets a specific issue message.
 */
function isValidPhone(value: string): boolean {
  const phone = parsePhoneNumberFromString(value, { defaultCountry: 'CA', extract: false })
  return !!phone && !phone.ext && phone.isValid()
}

/**
 * One digit group, optionally wrapped in parentheses. Returns the index after it, or null when
 * there is no group here (no digits, or an unclosed parenthesis).
 */
function consumeDigitGroup(input: string, start: number): number | null {
  let index = start
  const parenthesized = input[index] === '('
  if (parenthesized) index++

  const digitsStart = index
  while (index < input.length && input[index] >= '0' && input[index] <= '9') index++
  if (index === digitsStart) return null

  if (parenthesized) {
    if (input[index] !== ')') return null
    index++
  }

  return index
}

/** Separators between digit groups: dots, hyphens and whitespace. */
function consumeSeparators(input: string, start: number): number {
  let index = start
  while (
    index < input.length &&
    (input[index] === '.' || input[index] === '-' || /\s/.test(input[index]))
  ) {
    index++
  }
  return index
}

/**
 * Consume each character once. Nested repetitions in a regex can backtrack exponentially when a
 * long run of digits ends with an invalid character.
 */
function isPhoneFormat(value: string): boolean {
  const input = value.trim()
  let index = input.startsWith('+') ? 1 : 0

  while (index < input.length) {
    const afterGroup = consumeDigitGroup(input, index)
    if (afterGroup === null) return false
    if (afterGroup === input.length) return true

    // A separator must be followed by another digit group, which the next pass checks.
    index = consumeSeparators(input, afterGroup)
  }

  return false
}

/** Is this cell a usable recipient for the channel? */
function isValidRecipient(value: string, channel: BulkChannel): boolean {
  return channel === 'sms' ? isValidPhone(value) : isValidEmail(value)
}

/** Key a recipient for duplicate detection, matching how the server compares them. */
function recipientKey(value: string, channel: BulkChannel): string {
  return channel === 'sms'
    ? value.replace(/[^\d]/g, '').replace(/^1(?=\d{10}$)/, '')
    : value.toLowerCase()
}

/**
 * Build the sample spreadsheet for a template: the recipient column followed by one column per
 * placeholder. Headers only - a pre-filled example row is one careless upload away from being
 * mailed to whoever it names.
 */
export function buildSampleCsv(placeholders: string[], channel: BulkChannel): string {
  return Papa.unparse([[RECIPIENT_COLUMN[channel], ...placeholders]])
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
 * File-level problems, in the order they are reported. Returns null when the columns and the row
 * count are all usable.
 */
function checkFile(headers: string[], rows: string[][], expected: string[]): string | null {
  if (headers.length === 0) {
    return 'This file is empty. Download the sample CSV and fill it in.'
  }

  for (const column of expected) {
    if (!headers.includes(column)) {
      return `Your CSV file is missing required column called '${column}'.`
    }
  }

  const unexpected = headers.filter((header) => !expected.includes(header))
  if (unexpected.length > 0) {
    return `Your CSV file has a column this template does not use: '${unexpected[0]}'.`
  }

  const duplicateHeader = headers.find((header, index) => headers.indexOf(header) !== index)
  if (duplicateHeader) {
    return `Your CSV file has more than one column called '${duplicateHeader}'.`
  }

  if (rows.length === 0) {
    return 'This file has no recipients. Add one row per person.'
  }

  if (rows.length > MAX_RECIPIENTS) {
    return `This file has ${rows.length.toLocaleString()} recipients. The limit is ${MAX_RECIPIENTS.toLocaleString()} per send.`
  }

  return null
}

/**
 * The recipient cell: format, validity, destination support, then duplication. Records the row a
 * recipient was first seen on, so a later row can point back at it.
 */
function checkRecipient(
  value: string,
  rowNumber: number,
  column: string,
  channel: BulkChannel,
  firstSeenAt: Map<string, number>,
): RowIssue | null {
  // Syntax and number validity are separate: readable separators are allowed,
  // but letters, extensions, misplaced plus signs and unbalanced parentheses are not.
  if (channel === 'sms' && !isPhoneFormat(value)) {
    return {
      row: rowNumber,
      column,
      value,
      title: 'Invalid phone number format',
      detail:
        'Check and update the phone number using the expected format (e.g., +1-778-123-1234).',
    }
  }

  if (!isValidRecipient(value, channel)) {
    return {
      row: rowNumber,
      column,
      value,
      title: channel === 'sms' ? 'Invalid phone number' : 'Invalid format',
      // The offending value is already in its own column, so the detail is the fix alone.
      detail:
        channel === 'sms'
          ? 'Check the phone number.'
          : 'Use a single @ with a domain after it, like name@example.com.',
    }
  }

  if (channel === 'sms') {
    const phone = parsePhoneNumberFromString(value, { defaultCountry: 'CA', extract: false })!
    if (phone.countryCallingCode !== '1') {
      return {
        row: rowNumber,
        column,
        value,
        title: 'Unsupported destination',
        detail:
          'SMS is not supported in the country or region for this phone number. Remove this recipient.',
      }
    }
  }

  const normalised = recipientKey(value, channel)
  const firstSeen = firstSeenAt.get(normalised)
  if (firstSeen !== undefined) {
    return {
      row: rowNumber,
      column,
      value,
      title: `Duplicate of row ${firstSeen}`,
      detail: `This recipient was already listed on row ${firstSeen}. Remove one of the rows.`,
    }
  }

  firstSeenAt.set(normalised, rowNumber)
  return null
}

/** One issue per empty cell, plus whatever the recipient cell is guilty of. */
function checkCell(
  value: string,
  rowNumber: number,
  column: string,
  isRecipient: boolean,
  channel: BulkChannel,
  firstSeenAt: Map<string, number>,
): RowIssue | null {
  if (!value) {
    return {
      row: rowNumber,
      column,
      title: 'Missing or invalid value',
      detail: `The '${column}' column is empty. Fill it in, or delete the row.`,
    }
  }

  return isRecipient ? checkRecipient(value, rowNumber, column, channel, firstSeenAt) : null
}

/**
 * Check an uploaded file against the selected template.
 *
 * A file-level problem short-circuits: if the columns are wrong there is no point reporting the
 * same mistake once per row.
 */
export function validateCsv(
  parsed: ParsedCsv,
  placeholders: string[],
  channel: BulkChannel,
): ValidationResult {
  const { headers, rows } = parsed
  const recipientColumn = RECIPIENT_COLUMN[channel]

  const fileIssue = checkFile(headers, rows, [recipientColumn, ...placeholders])
  if (fileIssue) return { fileIssue, rowIssues: [] }

  const recipientIndex = headers.indexOf(recipientColumn)
  const rowIssues: RowIssue[] = []
  const firstSeenAt = new Map<string, number>()

  // The cap is checked per row, not per cell, so one row can carry it past the limit.
  for (let index = 0; index < rows.length && rowIssues.length < MAX_REPORTED_ISSUES; index++) {
    const row = rows[index]
    const rowNumber = index + 2 // header occupies row 1

    for (let column = 0; column < headers.length; column++) {
      const issue = checkCell(
        row[column] ?? '',
        rowNumber,
        headers[column],
        column === recipientIndex,
        channel,
        firstSeenAt,
      )
      if (issue) rowIssues.push(issue)
    }
  }

  return { fileIssue: null, rowIssues }
}

/**
 * The `mergeArray` the API expects: header row first, then one row per recipient, with the
 * recipient column renamed to `to` and moved to the front.
 */
export function toMergeArray(parsed: ParsedCsv, channel: BulkChannel): string[][] {
  const recipientIndex = parsed.headers.indexOf(RECIPIENT_COLUMN[channel])
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
export function rowParams(
  parsed: ParsedCsv,
  rowIndex: number,
  channel: BulkChannel,
): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const row = parsed.rows[rowIndex] ?? []

  parsed.headers.forEach((header, index) => {
    if (header !== RECIPIENT_COLUMN[channel]) {
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
export function rowRecipient(parsed: ParsedCsv, rowIndex: number, channel: BulkChannel): string {
  const recipientIndex = parsed.headers.indexOf(RECIPIENT_COLUMN[channel])
  return parsed.rows[rowIndex]?.[recipientIndex] ?? ''
}
