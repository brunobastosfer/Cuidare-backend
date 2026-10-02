import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Length,
  Matches,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';
export class RefreshTokenDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Matches(/^rf_[A-Za-z0-9_-]{43}$/)
  refreshToken!: string;
}
export class VerifyEmailDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Matches(/^ev_[A-Za-z0-9_-]{43}$/)
  token!: string;
}
function MatchesPassword(): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'matchesPassword',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      validator: {
        validate: (value: unknown, args: ValidationArguments) =>
          value === (args.object as Record<string, unknown>).password,
        defaultMessage: () => 'Confirmação da senha não corresponde.',
      },
    });
}
export class ResetPasswordDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Matches(/^pr_[A-Za-z0-9_-]{43}$/)
  token!: string;

  @ApiProperty({ minLength: 15, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(15, 128)
  password!: string;

  @ApiProperty({ minLength: 15, maxLength: 128, writeOnly: true })
  @IsString()
  @Length(15, 128)
  @MatchesPassword()
  passwordConfirmation!: string;
}
