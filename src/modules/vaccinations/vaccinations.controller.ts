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
import {
  vaccineCatalogView,
  vaccineScheduleView,
  vaccineScheduleDoseView,
  vaccinationView,
  vaccinationStatusView,
} from '../../presentation/views/vaccination.view';
import { VaccinationsService } from './vaccinations.service';
import {
  CreateVaccinationDto,
  UpdateVaccinationDto,
  ListVaccineSchedulesDto,
  VaccinationScheduleStatusDto,
} from './dto/vaccination.dto';
const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('Referências de vacinação')
@ApiBearerAuth()
@Controller('vaccine-catalog')
export class VaccineCatalogController {
  constructor(private readonly vaccinations: VaccinationsService) {}
  @Get()
  async list(@Query() pagination: PaginationDto) {
    return (await this.vaccinations.listCatalog(pagination)).map(vaccineCatalogView);
  }
  @Get(':id')
  async find(@Param('id', uuid) id: string) {
    return vaccineCatalogView(await this.vaccinations.findCatalog(id));
  }
}
@ApiTags('Referências de vacinação')
@ApiBearerAuth()
@Controller('vaccine-schedules')
export class VaccineSchedulesController {
  constructor(private readonly vaccinations: VaccinationsService) {}
  @Get()
  async list(@Query() query: ListVaccineSchedulesDto) {
    return (await this.vaccinations.listSchedules(query, query.type)).map(vaccineScheduleView);
  }
  @Get(':id')
  async find(@Param('id', uuid) id: string) {
    return vaccineScheduleView(await this.vaccinations.findSchedule(id));
  }
  @Get(':id/doses')
  async doses(@Param('id', uuid) id: string, @Query() pagination: PaginationDto) {
    const result = await this.vaccinations.listScheduleDoses(id, pagination);
    return {
      schedule: vaccineScheduleView(result.schedule),
      items: result.items.map(vaccineScheduleDoseView),
    };
  }
}
@ApiTags('Vacinações')
@ApiBearerAuth()
@Controller('dependents/:dependentId/vaccinations')
export class VaccinationsController {
  constructor(private readonly vaccinations: VaccinationsService) {}
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Query() pagination: PaginationDto,
  ) {
    return (await this.vaccinations.list(user.id, dependentId, pagination)).map(vaccinationView);
  }
  @Get('schedule-status')
  async status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Query() query: VaccinationScheduleStatusDto,
  ) {
    const result = await this.vaccinations.scheduleStatus(user.id, dependentId, query);
    return vaccinationStatusView(result.schedule, result.asOf, result.items);
  }
  @Get(':id')
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    return vaccinationView(await this.vaccinations.find(user.id, dependentId, id));
  }
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Body() dto: CreateVaccinationDto,
  ) {
    return vaccinationView(await this.vaccinations.create(user.id, dependentId, dto));
  }
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateVaccinationDto,
  ) {
    return vaccinationView(await this.vaccinations.update(user.id, dependentId, id, dto));
  }
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    await this.vaccinations.delete(user.id, dependentId, id);
  }
}
