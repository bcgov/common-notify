import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CstarBasicUserDto } from './add-cstar-tenant-user.dto'

// CSTAR's own rule: no leading or trailing whitespace.
const GROUP_NAME_PATTERN = /^\S(?:.*\S)?$/

export class CreateCstarGroupDto {
  @ApiProperty({ example: 'Template Editors' })
  @IsString()
  @Length(1, 255)
  @Matches(GROUP_NAME_PATTERN, { message: 'name must not start or end with whitespace' })
  name: string

  @ApiPropertyOptional({ example: 'People who can edit templates' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string
}

export class UpdateCstarGroupDto {
  @ApiPropertyOptional({ example: 'Template Editors' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Matches(GROUP_NAME_PATTERN, { message: 'name must not start or end with whitespace' })
  name?: string

  @ApiPropertyOptional({ example: 'People who can edit templates' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string
}

export class AddCstarGroupUserDto {
  @ApiProperty({ type: CstarBasicUserDto })
  @ValidateNested()
  @Type(() => CstarBasicUserDto)
  user: CstarBasicUserDto

  @ApiPropertyOptional({
    description:
      'Names of other shared services the user will get roles in through this group. CSTAR ' +
      'refuses the add (OTHER_SERVICES_NOT_CONFIRMED) until they are listed.',
    example: ['chefs'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 30, { each: true })
  confirmOtherServices?: string[]
}

class CstarGroupRoleToggleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string

  @ApiProperty()
  @IsBoolean()
  enabled: boolean
}

class CstarGroupSharedServiceRolesDto {
  @ApiProperty({ description: 'Shared service ID', format: 'uuid' })
  @IsUUID()
  id: string

  @ApiProperty({ type: [CstarGroupRoleToggleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CstarGroupRoleToggleDto)
  sharedServiceRoles: CstarGroupRoleToggleDto[]
}

/** Switch a group's roles on or off. Only Notify's own roles can be changed with Notify's token. */
export class UpdateCstarGroupRolesDto {
  @ApiProperty({ type: [CstarGroupSharedServiceRolesDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CstarGroupSharedServiceRolesDto)
  sharedServices: CstarGroupSharedServiceRolesDto[]
}
