import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, ValidateIf } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';
import { IsCivilDate } from '../../../common/validation/civil-date';
import { IsUtcInstant } from '../../../common/validation/utc-instant';
import {
  RECOMMENDATION_STATUSES,
  type RecommendationStatus,
} from '../../../domain/models/appointment.model';

// Null somente nos campos explicitamente anuláveis; não usar PartialType.
export class CreateAppointmentDto {
  @ApiProperty({ type: String, description: 'Timestamp UTC com Z' })
  @IsUtcInstant()
  date!: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(trimText)
  @IsString()
  @Length(1, 500)
  reason!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  specialty?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  professionalName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  institutionName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Timestamp UTC com Z' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsUtcInstant()
  followUpDate?: string | null;
}

// Null somente nos campos explicitamente anuláveis; não usar PartialType.
export class UpdateAppointmentDto {
  @ApiPropertyOptional({ type: String, description: 'Timestamp UTC com Z' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUtcInstant()
  date?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 500)
  reason?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  specialty?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  professionalName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  institutionName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Timestamp UTC com Z' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsUtcInstant()
  followUpDate?: string | null;
}

// Null somente nos campos explicitamente anuláveis; não usar PartialType.
export class CreateRecommendationDto {
  @ApiProperty({ maxLength: 160 })
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  description!: string;

  @ApiPropertyOptional({ enum: RECOMMENDATION_STATUSES })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(RECOMMENDATION_STATUSES)
  status?: RecommendationStatus;

  @ApiProperty({ type: String, description: 'Data civil YYYY-MM-DD' })
  @IsCivilDate()
  startDate!: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Data civil YYYY-MM-DD' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsCivilDate()
  endDate?: string | null;
}

// Null somente nos campos explicitamente anuláveis; não usar PartialType.
export class UpdateRecommendationDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  description?: string;

  @ApiPropertyOptional({ enum: RECOMMENDATION_STATUSES })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(RECOMMENDATION_STATUSES)
  status?: RecommendationStatus;

  @ApiPropertyOptional({ type: String, description: 'Data civil YYYY-MM-DD' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsCivilDate()
  startDate?: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Data civil YYYY-MM-DD' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsCivilDate()
  endDate?: string | null;
}
