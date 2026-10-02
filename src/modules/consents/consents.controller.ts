import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../../common/types/request.types';
import { consentView } from '../../presentation/views/consent.view';
import { ConsentsService } from './consents.service';
import { AcceptConsentDto } from './dto/accept-consent.dto';
@ApiTags('Consentimentos')
@ApiBearerAuth()
@Controller('consents')
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationDto) {
    return (await this.consents.list(user.id, pagination)).map(consentView);
  }
  @Post()
  async accept(@CurrentUser() user: AuthenticatedUser, @Body() dto: AcceptConsentDto) {
    return consentView(await this.consents.accept(user.id, dto));
  }
}
