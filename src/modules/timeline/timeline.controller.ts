import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/request.types';
import { timelinePageView } from '../../presentation/views/timeline.view';
import { ListTimelineDto } from './dto/list-timeline.dto';
import { TimelineService } from './timeline.service';
@ApiTags('Linha do tempo')
@ApiBearerAuth()
@Controller('dependents/:dependentId/timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', new ParseUUIDPipe({ version: '4' })) dependentId: string,
    @Query() query: ListTimelineDto,
  ) {
    return timelinePageView(await this.timeline.list(user.id, dependentId, query));
  }
}
