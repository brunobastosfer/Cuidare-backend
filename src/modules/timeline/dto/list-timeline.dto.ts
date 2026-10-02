import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  TIMELINE_EVENT_TYPES,
  type TimelineEventType,
  type TimelineOrder,
} from '../../../domain/models/timeline-event.model';
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
export class ListTimelineDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  order: TimelineOrder = 'desc';

  @ApiPropertyOptional({
    description: 'Início inclusivo, timestamp UTC com Z.',
    example: '2026-01-01T00:00:00Z',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(UTC_TIMESTAMP)
  @IsISO8601({ strict: true, strictSeparator: true })
  from?: string;

  @ApiPropertyOptional({
    description: 'Fim inclusivo, timestamp UTC com Z.',
    example: '2026-12-31T23:59:59.999Z',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(UTC_TIMESTAMP)
  @IsISO8601({ strict: true, strictSeparator: true })
  to?: string;

  @ApiPropertyOptional({ enum: TIMELINE_EVENT_TYPES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(TIMELINE_EVENT_TYPES)
  type?: TimelineEventType;

  @ApiPropertyOptional({
    description: 'Cursor retornado na página anterior; manter filtros e ordem.',
    maxLength: 1024,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(1024)
  @Matches(/^tl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
  cursor?: string;
}
