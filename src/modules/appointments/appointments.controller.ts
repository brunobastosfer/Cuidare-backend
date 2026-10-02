import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../../common/types/request.types';
import { appointmentView, recommendationView } from '../../presentation/views/appointment.view';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CreateRecommendationDto,
  UpdateRecommendationDto,
} from './dto/appointment.dto';
const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('Consultas')
@ApiBearerAuth()
@Controller('dependents/:dependentId/appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Get('')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Query() pagination: PaginationDto,
  ) {
    return (await this.appointments.list(user.id, dependentId, pagination)).map(appointmentView);
  }
  @Get(':id')
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    return appointmentView(await this.appointments.find(user.id, dependentId, id));
  }
  @Post('')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return appointmentView(await this.appointments.create(user.id, dependentId, dto));
  }
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return appointmentView(await this.appointments.update(user.id, dependentId, id, dto));
  }
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    await this.appointments.delete(user.id, dependentId, id);
  }
  @Get(':appointmentId/recommendations')
  async listRecommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('appointmentId', uuid) appointmentId: string,
    @Query() pagination: PaginationDto,
  ) {
    return (
      await this.appointments.listRecommendations(user.id, dependentId, appointmentId, pagination)
    ).map(recommendationView);
  }
  @Get(':appointmentId/recommendations/:id')
  async findRecommendation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('appointmentId', uuid) appointmentId: string,
    @Param('id', uuid) id: string,
  ) {
    return recommendationView(
      await this.appointments.findRecommendation(user.id, dependentId, appointmentId, id),
    );
  }
  @Post(':appointmentId/recommendations')
  async createRecommendation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('appointmentId', uuid) appointmentId: string,
    @Body() dto: CreateRecommendationDto,
  ) {
    return recommendationView(
      await this.appointments.createRecommendation(user.id, dependentId, appointmentId, dto),
    );
  }
  @Patch(':appointmentId/recommendations/:id')
  async updateRecommendation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('appointmentId', uuid) appointmentId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateRecommendationDto,
  ) {
    return recommendationView(
      await this.appointments.updateRecommendation(user.id, dependentId, appointmentId, id, dto),
    );
  }
  @Delete(':appointmentId/recommendations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRecommendation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('appointmentId', uuid) appointmentId: string,
    @Param('id', uuid) id: string,
  ) {
    await this.appointments.deleteRecommendation(user.id, dependentId, appointmentId, id);
  }
}
