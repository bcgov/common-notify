import { Type } from 'class-transformer'
import { IsEmail, IsIn, IsOptional, IsString, Length, ValidateNested } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/** The user to add, in CSTAR's BasicUser shape. Lengths mirror CSTAR's own limits. */
export class CstarBasicUserDto {
  @ApiProperty({
    description: 'SSO user ID (IDIR or BCeID GUID)',
    example: 'fd33f1cef7ca4b19a71104d4ecf7066b',
  })
  @IsString()
  @Length(1, 32)
  ssoUserId: string

  @ApiProperty({ example: 'John' })
  @IsString()
  @Length(1, 50)
  firstName: string

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @Length(1, 50)
  lastName: string

  @ApiProperty({ example: 'Smith, John: CITZ: EX' })
  @IsString()
  @Length(1, 50)
  displayName: string

  @ApiPropertyOptional({ example: 'JSMITH1' })
  @IsOptional()
  @IsString()
  @Length(1, 15)
  userName?: string

  @ApiPropertyOptional({ example: 'john.smith@gov.bc.ca' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({ enum: ['idir', 'bceidbusiness'], example: 'idir' })
  @IsIn(['idir', 'bceidbusiness'])
  idpType: 'idir' | 'bceidbusiness'
}

/**
 * Add a user to a CSTAR tenant. No roles or groups: with Notify's shared service token CSTAR
 * always assigns SERVICE_USER and rejects a request that sends either.
 */
export class AddCstarTenantUserDto {
  @ApiProperty({ type: CstarBasicUserDto })
  @ValidateNested()
  @Type(() => CstarBasicUserDto)
  user: CstarBasicUserDto
}
