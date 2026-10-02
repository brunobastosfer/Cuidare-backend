import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
export class AcceptConsentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Z][A-Z0-9_]{0,63}$/)
  type!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]{1,64}$/)
  policyVersion!: string;

  @ApiPropertyOptional()
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('4')
  dependentId?: string;
}
