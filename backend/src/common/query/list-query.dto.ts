import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class ListQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 10 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10

  @IsOptional()
  @IsString()
  sort?: string

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined
    }
    return Array.isArray(value) ? value : [value]
  })
  @IsString({ each: true })
  filter?: string[]
}
