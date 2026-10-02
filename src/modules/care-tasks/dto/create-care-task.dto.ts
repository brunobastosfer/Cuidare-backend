import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength } from 'class-validator';
import { trimText } from '../../../common/utils/normalize-text';

export class CreateCareTaskDto {
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trimText)
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  @Transform(trimText)
  @IsString()
  @MaxLength(2000)
  description!: string;
}
