import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail, trimText } from '../../../common/utils/normalize-text';

export class RegisterDto {
  @ApiProperty({ minLength: 2, maxLength: 120, example: 'Bruno' })
  @Transform(trimText)
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ format: 'email', maxLength: 254, example: 'pessoa@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 15, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(15, 128)
  password!: string;
}
