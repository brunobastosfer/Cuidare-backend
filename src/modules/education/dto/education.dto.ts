import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Min, Max, ValidateIf } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';
import { IsCivilDate } from '../../../common/validation/civil-date';
export class CreateEnrollmentDto {
  @ApiProperty({ maxLength: 160 })
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  schoolName!: string;
  @ApiProperty({ minimum: 1, maximum: 9999 }) @IsInt() @Min(1) @Max(9999) schoolYear!: number;
  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  grade?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 80)
  className?: string | null;
  @ApiProperty({ description: 'Data civil YYYY-MM-DD; matrícula planejada permitida' })
  @IsCivilDate()
  startDate!: string;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsCivilDate()
  endDate?: string | null;
}
export class UpdateEnrollmentDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  schoolName?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 9999 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(9999)
  schoolYear?: number;
  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 120)
  grade?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 80)
  className?: string | null;
  @ApiPropertyOptional()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsCivilDate()
  startDate?: string;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsCivilDate()
  endDate?: string | null;
}
export class CreateReportDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsUUID('4')
  enrollmentId?: string | null;
  @ApiProperty({ maxLength: 160 }) @Transform(trimText) @IsString() @Length(1, 160) title!: string;
  @ApiProperty({ description: 'Data civil YYYY-MM-DD informada, não futura' })
  @IsCivilDate()
  reportDate!: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  summary?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  observations?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsUUID('4')
  documentId?: string | null;
}
export class UpdateReportDto {
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsUUID('4')
  enrollmentId?: string | null;
  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  title?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsCivilDate()
  reportDate?: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  summary?: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  observations?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined && v !== null)
  @IsUUID('4')
  documentId?: string | null;
}
