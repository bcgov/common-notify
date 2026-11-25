import { applyDecorators } from '@nestjs/common'
import { ApiHideProperty } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'
import { NOTIFICATION_PRIORITIES } from '../../../queue/job-priority'

/**
 * An optional send priority: high, normal or low. Not yet advertised.
 * NotifySubmissionService drops it if the feature flag is disabled.
 */
export const PriorityProperty = () =>
  applyDecorators(ApiHideProperty(), IsOptional(), IsIn(NOTIFICATION_PRIORITIES))
