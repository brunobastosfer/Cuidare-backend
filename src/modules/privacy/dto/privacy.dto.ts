import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';
export class ExportPrivacyDto {
  @ApiProperty({
    writeOnly: true,
    maxLength: 128,
    description: 'Reautenticação para exportação em massa.',
  })
  @IsString()
  @Length(1, 128)
  password!: string;
  @ApiProperty({ enum: ['JSON'] })
  @IsIn(['JSON'])
  format!: 'JSON';
  @ApiPropertyOptional({
    type: [String],
    maxItems: 20,
    description:
      'Somente dependentes explicitamente selecionados com vínculo OWNER; vazio exporta apenas a conta.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  dependentIds?: string[];
}
export class RequestAccountDeletionDto {
  @ApiProperty({ writeOnly: true, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;
  @ApiProperty({
    enum: ['DELETE_MY_ACCOUNT'],
    description:
      'Fecha o acesso imediatamente. Eliminação definitiva exige revisão de retenção e dependências.',
  })
  @IsIn(['DELETE_MY_ACCOUNT'])
  confirmation!: 'DELETE_MY_ACCOUNT';
}
