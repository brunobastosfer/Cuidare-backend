import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, ValidateIf } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';
import { IsBirthDate } from '../../../common/validation/birth-date';
import type { DependentRelationship } from '../../../domain/models/dependent.model';
export class CreateDependentDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trimText)
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  preferredName?: string | null;

  @ApiProperty({ type: String, example: '2020-02-29' })
  @IsBirthDate()
  birthDate!: string;

  @ApiPropertyOptional({ enum: ['PARENT', 'LEGAL_GUARDIAN', 'OTHER'] })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(['PARENT', 'LEGAL_GUARDIAN', 'OTHER'])
  relationship?: DependentRelationship;
}
