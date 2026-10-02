import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Length, ValidateIf } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';
import { IsCivilDate } from '../../../common/validation/civil-date';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '../../../domain/models/document.model';

export class CreateDocumentDto {
  @ApiProperty({ enum: DOCUMENT_CATEGORIES })
  @IsIn(DOCUMENT_CATEGORIES)
  category!: DocumentCategory;

  @ApiProperty({ maxLength: 160 })
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Data civil YYYY-MM-DD' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsCivilDate()
  documentDate?: string | null;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional({ enum: DOCUMENT_CATEGORIES })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsIn(DOCUMENT_CATEGORIES)
  category?: DocumentCategory;

  @ApiPropertyOptional({ maxLength: 160 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  title?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @Transform(trimText)
  @IsString()
  @Length(1, 2000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Data civil YYYY-MM-DD' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined && value !== null)
  @IsCivilDate()
  documentDate?: string | null;
}
