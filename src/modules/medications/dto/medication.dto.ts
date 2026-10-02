import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';
import { IsCivilDate } from '../../../common/validation/civil-date';
import {
  MEDICATION_TREATMENT_STATUSES,
  type MedicationTreatmentStatus,
} from '../../../domain/models/medication.model';
export class MedicationProductDto {
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  name!: string;
}
export class CreateMedicationTreatmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  medicationId!: string;

  @ApiProperty({ description: 'Texto informado, nunca calculado.', maxLength: 120 })
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  dosage!: string;

  @ApiProperty({ maxLength: 60 })
  @Transform(trimText)
  @IsString()
  @Length(1, 60)
  unit!: string;

  @ApiProperty({ maxLength: 160 })
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  frequency!: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsCivilDate()
  startDate!: string;

  @ApiPropertyOptional({ nullable: true, example: '2026-01-15' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsCivilDate()
  endDate?: string | null;

  @ApiPropertyOptional({ default: false })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  continuousUse?: boolean;

  @ApiPropertyOptional({ enum: MEDICATION_TREATMENT_STATUSES, default: 'ACTIVE' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(MEDICATION_TREATMENT_STATUSES)
  status?: MedicationTreatmentStatus;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 100)
  route?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  instructions?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  prescribedBy?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 500)
  reason?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  notes?: string | null;
}
// Não usar PartialType: IsOptional aceitaria null em campos obrigatórios.
export class UpdateMedicationTreatmentDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  dosage?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 60)
  unit?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  frequency?: string;

  @ApiPropertyOptional({ type: String })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsCivilDate()
  startDate?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsCivilDate()
  endDate?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  continuousUse?: boolean;

  @ApiPropertyOptional({ enum: MEDICATION_TREATMENT_STATUSES })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(MEDICATION_TREATMENT_STATUSES)
  status?: MedicationTreatmentStatus;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 100)
  route?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  instructions?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  prescribedBy?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 500)
  reason?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  notes?: string | null;
}
