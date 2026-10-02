import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/request.types';
import { EmptyBodyPipe } from '../../common/validation/empty-body.pipe';
import { deletionRequestView } from '../../presentation/views/privacy.view';
import { consentView } from '../../presentation/views/consent.view';
import { ConsentsService } from '../consents/consents.service';
import { PrivacyService } from './privacy.service';
import { ExportPrivacyDto, RequestAccountDeletionDto } from './dto/privacy.dto';
@ApiTags('Privacidade')
@ApiBearerAuth()
@Controller('privacy')
export class PrivacyController {
  constructor(
    private readonly privacy: PrivacyService,
    private readonly consents: ConsentsService,
  ) {}
  @Post('exports')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Header('Content-Disposition', 'attachment; filename="cuidare-export.json"')
  @ApiOperation({ summary: 'Exportar JSON da conta e dependentes selecionados com papel OWNER' })
  export(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExportPrivacyDto) {
    return this.privacy.export(user.id, dto);
  }
  @Post('account-deletion-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: 'Confirmar senha, fechar acesso e solicitar revisão de eliminação definitiva',
  })
  async requestDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestAccountDeletionDto,
  ) {
    return deletionRequestView(await this.privacy.requestDeletion(user.id, dto));
  }
  @Post('consents/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Revogar os aceites próprios baseados em consentimento do mesmo tipo/escopo',
  })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new EmptyBodyPipe()) _body: void,
  ) {
    return consentView(await this.consents.revoke(user.id, id));
  }
}
