import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, Matches } from 'class-validator'

export class PreviewGroupRecipientsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^[A-Za-z0-9_-]{1,128}$/, { each: true })
  groupIds: string[]
}
