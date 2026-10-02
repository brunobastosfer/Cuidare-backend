import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, ValidateIf } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';
import { IsBirthDate } from '../../../common/validation/birth-date';
export class UpdateDependentDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  preferredName?: string | null;

  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBirthDate()
  birthDate?: string;
}
