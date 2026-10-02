import { Body, Controller, Header, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmptyBodyPipe } from '../../common/validation/empty-body.pipe';
import type { ApiRequest, AuthenticatedUser } from '../../common/types/request.types';
import { AuthService } from './auth.service';
import { AccountSecurityService } from './account-security.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccountEmailDto } from './dto/account-email.dto';
import { RefreshTokenDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth-tokens.dto';
@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountSecurityService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Solicitar cadastro; resposta neutra, sem sessão' })
  register(@Body() dto: RegisterDto, @Req() request: ApiRequest) {
    return this.auth.register(dto, request.ip ?? 'unknown');
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Autenticar e iniciar sessão com refresh rotativo' })
  login(@Body() dto: LoginDto, @Req() request: ApiRequest) {
    return this.auth.login(dto, request.ip ?? 'unknown');
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedUser, @Body(new EmptyBodyPipe()) _body: void) {
    await this.auth.logout(user.id, user.sessionId);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Body(new EmptyBodyPipe()) _body: void) {
    await this.auth.logoutAll(user.id);
  }

  @Public()
  @Post('request-email-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  requestVerification(@Body() dto: AccountEmailDto, @Req() request: ApiRequest) {
    return this.account.request('EMAIL_VERIFICATION', dto.email, request.ip ?? 'unknown');
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verify(@Body() dto: VerifyEmailDto) {
    await this.account.verifyEmail(dto.token);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  forgot(@Body() dto: AccountEmailDto, @Req() request: ApiRequest) {
    return this.account.request('PASSWORD_RESET', dto.email, request.ip ?? 'unknown');
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async reset(@Body() dto: ResetPasswordDto) {
    await this.account.resetPassword(dto.token, dto.password);
  }
}
