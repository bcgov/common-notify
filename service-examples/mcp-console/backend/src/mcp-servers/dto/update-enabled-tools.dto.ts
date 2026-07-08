import { IsArray, IsString } from 'class-validator';

export class UpdateEnabledToolsDto {
  @IsArray()
  @IsString({ each: true })
  enabledTools: string[];
}
