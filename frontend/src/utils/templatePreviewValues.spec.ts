import { describe, expect, it } from 'vitest'
import { initializePreviewValues, previewRenderParams } from './templatePreviewValues'
import type { DetectedVariable } from './templateVariables'

const variables: DetectedVariable[] = [
  { name: 'name', type: 'text' },
  { name: 'added', type: 'text' },
  { name: 'approved', type: 'boolean' },
  { name: 'newFlag', type: 'boolean' },
]

describe('template preview values', () => {
  it('keeps saved values, defaults added variables and ignores removed variables', () => {
    const saved = { name: '', approved: 'false', removed: 'Old value' }
    expect(initializePreviewValues(variables, saved)).toEqual({
      name: '',
      added: '',
      approved: 'false',
      newFlag: 'true',
    })
    expect(saved).toEqual({ name: '', approved: 'false', removed: 'Old value' })
  })

  it('converts booleans only for rendering and excludes obsolete keys', () => {
    const values = { name: 'Jane', approved: 'false', newFlag: 'true', removed: 'Old' }
    expect(previewRenderParams(variables, values)).toEqual({
      name: 'Jane',
      added: '',
      approved: '',
      newFlag: 'true',
    })
    expect(values.approved).toBe('false')
  })

  it('treats prototype property names as ordinary placeholders', () => {
    expect(initializePreviewValues([{ name: 'constructor', type: 'text' }], {})).toEqual({
      constructor: '',
    })
  })
})
