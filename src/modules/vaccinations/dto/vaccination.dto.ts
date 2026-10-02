import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';
import { IsCivilDate } from '../../../common/validation/civil-date';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  VACCINE_SCHEDULE_TYPES,
  type VaccineScheduleType,
} from '../../../domain/models/vaccination.model';
export class CreateVaccinationDto {
  @ApiProperty() @IsUUID('4') vaccineId!: string;
  @ApiProperty({ maxLength: 40 }) @Transform(trimText) @IsString() @Length(1, 40) dose!: string;
  @ApiProperty({ description: 'Data civil YYYY-MM-DD informada; não futura' })
  @IsCivilDate()
  administeredAt!: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  institutionName?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 80)
  batchNumber?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  notes?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsUUID('4')
  documentId?: string | null;
}
export class UpdateVaccinationDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 40)
  dose?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsCivilDate()
  administeredAt?: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  institutionName?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 80)
  batchNumber?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  notes?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsUUID('4')
  documentId?: string | null;
}
export class ListVaccineSchedulesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: VACCINE_SCHEDULE_TYPES })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsIn(VACCINE_SCHEDULE_TYPES)
  type?: VaccineScheduleType;
}
export class VaccinationScheduleStatusDto {
  @ApiProperty() @IsUUID('4') scheduleId!: string;
  @ApiPropertyOptional({ description: 'Data civil de comparação, UTC hoje por padrão; não futura' })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsCivilDate()
  asOf?: string;
}
