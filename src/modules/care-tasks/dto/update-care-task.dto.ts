import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';

export class UpdateCareTaskDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 160 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  completed?: boolean;
}
