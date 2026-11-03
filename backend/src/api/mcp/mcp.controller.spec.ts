import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAG_KEY } from '../../common/decorators/feature-flag.decorator'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { McpController } from './mcp.controller'

describe('McpController metadata', () => {
  it('authenticates the tenant before checking the feature flag', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, McpController)).toStrictEqual([
      NotifyServiceGuard,
      FeatureFlagGuard,
    ])
  })

  it('requires the MCP API feature flag at class level', () => {
    expect(Reflect.getMetadata(FEATURE_FLAG_KEY, McpController)).toBe(FeatureFlagCode.MCP_API)
  })
})
