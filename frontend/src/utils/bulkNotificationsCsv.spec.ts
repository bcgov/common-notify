import { describe, expect, it } from 'vitest'
import {
  buildSampleCsv,
  csvFilenameFor,
  parseCsv,
  rowParams,
  rowRecipient,
  toMergeArray,
  validateCsv,
  MAX_RECIPIENTS,
} from './bulkNotificationsCsv'

const placeholders = ['firstName']

describe('buildSampleCsv', () => {
  it('puts the recipient column first, then the placeholders', () => {
    expect(buildSampleCsv(['firstName', 'dueDate'], 'email')).toBe('email,firstName,dueDate')
  })

  it('emits only a header row, so nothing can be sent by accident', () => {
    expect(buildSampleCsv(['firstName'], 'email').split('\n')).toHaveLength(1)
  })
})

describe('csvFilenameFor', () => {
  it('slugifies the template name', () => {
    expect(csvFilenameFor('Permit Renewal Notice')).toBe('permit-renewal-notice-recipients.csv')
  })

  it('falls back when the name has nothing usable in it', () => {
    expect(csvFilenameFor('***')).toBe('template-recipients.csv')
  })
})

describe('parseCsv', () => {
  it('splits headers from rows and trims cells', () => {
    const parsed = parseCsv('email, firstName \nalice@gov.bc.ca , Alice ')

    expect(parsed.headers).toEqual(['email', 'firstName'])
    expect(parsed.rows).toEqual([['alice@gov.bc.ca', 'Alice']])
  })

  it('keeps a quoted value containing a comma intact', () => {
    expect(parseCsv('email,address\nalice@gov.bc.ca,"1 Main St, Victoria"').rows).toEqual([
      ['alice@gov.bc.ca', '1 Main St, Victoria'],
    ])
  })

  it('keeps a quoted value spanning lines intact', () => {
    expect(parseCsv('email,note\nalice@gov.bc.ca,"line one\nline two"').rows).toEqual([
      ['alice@gov.bc.ca', 'line one\nline two'],
    ])
  })

  it('strips the byte order mark Excel writes', () => {
    expect(parseCsv('﻿email,firstName\nalice@gov.bc.ca,Alice').headers[0]).toBe('email')
  })

  it('reads CRLF line endings', () => {
    expect(parseCsv('email,firstName\r\nalice@gov.bc.ca,Alice\r\n').rows).toEqual([
      ['alice@gov.bc.ca', 'Alice'],
    ])
  })
})

describe('validateCsv file-level problems', () => {
  it('accepts a file that matches the template', () => {
    const parsed = { headers: ['email', 'firstName'], rows: [['alice@gov.bc.ca', 'Alice']] }

    expect(validateCsv(parsed, placeholders, 'email')).toEqual({ fileIssue: null, rowIssues: [] })
  })

  it('names the missing column the way the design does', () => {
    const parsed = { headers: ['email'], rows: [['alice@gov.bc.ca']] }

    expect(validateCsv(parsed, placeholders, 'email').fileIssue).toBe(
      "Your CSV file is missing required column called 'firstName'.",
    )
  })

  it('reports a missing recipient column by its UI name, not the API name', () => {
    const parsed = { headers: ['firstName'], rows: [['Alice']] }

    expect(validateCsv(parsed, placeholders, 'email').fileIssue).toBe(
      "Your CSV file is missing required column called 'email'.",
    )
  })

  it('reports a column the template does not use', () => {
    const parsed = { headers: ['email', 'firstName', 'notes'], rows: [['a@gov.bc.ca', 'A', 'x']] }

    expect(validateCsv(parsed, placeholders, 'email').fileIssue).toContain("'notes'")
  })

  it('reports an empty file', () => {
    expect(validateCsv({ headers: [], rows: [] }, placeholders, 'email').fileIssue).toContain(
      'empty',
    )
  })

  it('reports a file with headers but no recipients', () => {
    const parsed = { headers: ['email', 'firstName'], rows: [] }

    expect(validateCsv(parsed, placeholders, 'email').fileIssue).toContain('no recipients')
  })

  it('reports a file over the recipient limit without listing every row', () => {
    const rows = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => [`p${i}@gov.bc.ca`, 'Name'])
    const result = validateCsv({ headers: ['email', 'firstName'], rows }, placeholders, 'email')

    expect(result.fileIssue).toContain('The limit is')
    expect(result.rowIssues).toEqual([])
  })

  it('does not report row problems while the columns are wrong', () => {
    const parsed = { headers: ['email'], rows: [['not-an-email']] }

    expect(validateCsv(parsed, placeholders, 'email').rowIssues).toEqual([])
  })
})

describe('validateCsv row-level problems', () => {
  it('reports an empty cell with a dash for the value, as the table renders it', () => {
    const parsed = { headers: ['email', 'firstName'], rows: [['alice@gov.bc.ca', '']] }

    expect(validateCsv(parsed, placeholders, 'email').rowIssues).toEqual([
      { row: 2, column: 'firstName', issue: 'Missing or invalid value' },
    ])
  })

  it('reports a malformed address with the value it found', () => {
    const parsed = {
      headers: ['email', 'firstName'],
      rows: [
        ['alice@gov.bc.ca', 'Alice'],
        ['lisa.thompson@govbcca', 'Lisa'],
      ],
    }

    // Row 1 is the header, so Lisa is row 3 to the person editing the file.
    expect(validateCsv(parsed, placeholders, 'email').rowIssues).toEqual([
      { row: 3, column: 'email', value: 'lisa.thompson@govbcca', issue: 'Invalid format' },
    ])
  })

  it('reports a duplicate against the row it first appeared on', () => {
    const parsed = {
      headers: ['email', 'firstName'],
      rows: [
        ['alice@gov.bc.ca', 'Alice'],
        ['ALICE@gov.bc.ca', 'Alice again'],
      ],
    }

    expect(validateCsv(parsed, placeholders, 'email').rowIssues).toEqual([
      { row: 3, column: 'email', value: 'ALICE@gov.bc.ca', issue: 'Duplicate of row 2' },
    ])
  })

  it('caps how many row problems it reports', () => {
    const rows = Array.from({ length: 500 }, () => ['not-an-email', 'Name'])

    expect(
      validateCsv({ headers: ['email', 'firstName'], rows }, placeholders, 'email').rowIssues
        .length,
    ).toBe(100)
  })
})

describe('toMergeArray', () => {
  it('renames the recipient column to the one the API expects', () => {
    const parsed = { headers: ['email', 'firstName'], rows: [['alice@gov.bc.ca', 'Alice']] }

    expect(toMergeArray(parsed, 'email')).toEqual([
      ['to', 'firstName'],
      ['alice@gov.bc.ca', 'Alice'],
    ])
  })

  it('moves the recipient column to the front when the file lists it elsewhere', () => {
    const parsed = { headers: ['firstName', 'email'], rows: [['Alice', 'alice@gov.bc.ca']] }

    expect(toMergeArray(parsed, 'email')).toEqual([
      ['to', 'firstName'],
      ['alice@gov.bc.ca', 'Alice'],
    ])
  })
})

describe('rowParams and rowRecipient', () => {
  it('maps a row onto placeholder names, leaving the address out', () => {
    const parsed = {
      headers: ['email', 'firstName', 'dueDate'],
      rows: [['alice@gov.bc.ca', 'Alice', '2026-09-15']],
    }

    expect(rowParams(parsed, 0, 'email')).toEqual({ firstName: 'Alice', dueDate: '2026-09-15' })
    expect(rowRecipient(parsed, 0, 'email')).toBe('alice@gov.bc.ca')
  })

  it('nests a dotted column so the preview renders {{alert.id}}', () => {
    const parsed = {
      headers: ['email', 'alert.id', 'alert.severity', 'recipient.firstName'],
      rows: [['alice@gov.bc.ca', 'A-1', 'High', 'Alice']],
    }

    expect(rowParams(parsed, 0, 'email')).toEqual({
      alert: { id: 'A-1', severity: 'High' },
      recipient: { firstName: 'Alice' },
    })
  })

  it('supplies the root key the personalisation check looks for', () => {
    const parsed = { headers: ['email', 'alert.id'], rows: [['alice@gov.bc.ca', 'A-1']] }

    expect(Object.prototype.hasOwnProperty.call(rowParams(parsed, 0, 'email'), 'alert')).toBe(true)
  })

  it('ignores a column that would write through the prototype chain', () => {
    const parsed = {
      headers: ['email', '__proto__.polluted', 'firstName'],
      rows: [['alice@gov.bc.ca', 'yes', 'Alice']],
    }

    expect(rowParams(parsed, 0, 'email')).toEqual({ firstName: 'Alice' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('finds the address wherever the recipient column sits', () => {
    const parsed = { headers: ['firstName', 'email'], rows: [['Alice', 'alice@gov.bc.ca']] }

    expect(rowRecipient(parsed, 0, 'email')).toBe('alice@gov.bc.ca')
    expect(rowParams(parsed, 0, 'email')).toEqual({ firstName: 'Alice' })
  })
})
