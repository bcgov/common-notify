import { IsObject, IsString, MinLength } from 'class-validator';

export class ExecuteToolDto {
  @IsString()
  @MinLength(1)
  toolName: string;

  @IsObject()
  arguments: Record<string, unknown>;
}
