import { ApiProperty } from '@nestjs/swagger'
import type { Type } from '@nestjs/common'

/**
 * Factory that produces a typed paginated response class for use with NestJS Swagger.
 * Swagger requires concrete types at decoration time, so a mixin is used instead of
 * a plain generic class.
 *
 * Usage:
 *   export class PaginatedFooResponse extends PaginatedResponse(FooDto) {}
 */
export function PaginatedResponse<T>(itemType: Type<T>) {
  class PaginatedResponseClass {
    @ApiProperty({ type: [itemType] })
    data: T[]

    @ApiProperty({ description: 'Total number of items', example: 42 })
    count: number

    @ApiProperty({ description: 'Current page number (1-indexed)', example: 1 })
    page: number

    @ApiProperty({ description: 'Items per page', example: 10 })
    limit: number

    @ApiProperty({ description: 'Total number of pages', example: 5 })
    totalPages: number
  }
  return PaginatedResponseClass
}
