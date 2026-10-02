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
import { enrollmentView, schoolReportView } from '../../presentation/views/education.view';
import { EducationService } from './education.service';
import {
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
  CreateReportDto,
  UpdateReportDto,
} from './dto/education.dto';
const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('Educação')
@ApiBearerAuth()
@Controller('dependents/:dependentId/education')
export class EducationController {
  constructor(private readonly education: EducationService) {}
  @Get('enrollments')
  async listEnrollments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Query() pagination: PaginationDto,
  ) {
    return (await this.education.listEnrollments(user.id, dependentId, pagination)).map(
      enrollmentView,
    );
  }
  @Get('enrollments/:id')
  async findEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    return enrollmentView(await this.education.findEnrollment(user.id, dependentId, id));
  }
  @Post('enrollments')
  async createEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Body() dto: CreateEnrollmentDto,
  ) {
    return enrollmentView(await this.education.createEnrollment(user.id, dependentId, dto));
  }
  @Patch('enrollments/:id')
  async updateEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateEnrollmentDto,
  ) {
    return enrollmentView(await this.education.updateEnrollment(user.id, dependentId, id, dto));
  }
  @Delete('enrollments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    await this.education.deleteEnrollment(user.id, dependentId, id);
  }
  @Get('reports')
  async listReports(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Query() pagination: PaginationDto,
  ) {
    return (await this.education.listReports(user.id, dependentId, pagination)).map(
      schoolReportView,
    );
  }
  @Get('reports/:id')
  async findReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    return schoolReportView(await this.education.findReport(user.id, dependentId, id));
  }
  @Post('reports')
  async createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Body() dto: CreateReportDto,
  ) {
    return schoolReportView(await this.education.createReport(user.id, dependentId, dto));
  }
  @Patch('reports/:id')
  async updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return schoolReportView(await this.education.updateReport(user.id, dependentId, id, dto));
  }
  @Delete('reports/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    await this.education.deleteReport(user.id, dependentId, id);
  }
}
