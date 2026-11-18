import { applyDecorators } from '@nestjs/common'
import { ApiHideProperty } from '@nestjs/swagger'
import { IsIn, IsOptional } from 'class-validator'
import { NOTIFICATION_PRIORITIES } from '../../../queue/job-priority'

/**
 * An optional send priority: high, normal or low. Validated like any other field, but hidden
 * from Swagger: priority is accepted, not yet advertised.
 */
export const PriorityProperty = () =>
  applyDecorators(ApiHideProperty(), IsOptional(), IsIn(NOTIFICATION_PRIORITIES))
