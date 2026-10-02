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
import { medicationView, medicationTreatmentView } from '../../presentation/views/medication.view';
import { MedicationsService } from './medications.service';
import {
  MedicationProductDto,
  CreateMedicationTreatmentDto,
  UpdateMedicationTreatmentDto,
} from './dto/medication.dto';
const uuid = new ParseUUIDPipe({ version: '4' });
@ApiTags('Medicamentos')
@ApiBearerAuth()
@Controller('dependents/:dependentId')
export class MedicationsController {
  constructor(private readonly medications: MedicationsService) {}
  @Get('medication-products')
  async products(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Query() pagination: PaginationDto,
  ) {
    return (await this.medications.listProducts(user.id, dependentId, pagination)).map(
      medicationView,
    );
  }
  @Post('medication-products')
  async createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Body() dto: MedicationProductDto,
  ) {
    return medicationView(await this.medications.createProduct(user.id, dependentId, dto));
  }
  @Get('medication-products/:id')
  async product(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    return medicationView(await this.medications.findProduct(user.id, dependentId, id));
  }
  @Patch('medication-products/:id')
  async updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
    @Body() dto: MedicationProductDto,
  ) {
    return medicationView(await this.medications.updateProduct(user.id, dependentId, id, dto));
  }
  @Delete('medication-products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    await this.medications.deleteProduct(user.id, dependentId, id);
  }
  @Get('medications')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Query() pagination: PaginationDto,
  ) {
    return (await this.medications.listTreatments(user.id, dependentId, pagination)).map(
      medicationTreatmentView,
    );
  }
  @Post('medications')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Body() dto: CreateMedicationTreatmentDto,
  ) {
    return medicationTreatmentView(
      await this.medications.createTreatment(user.id, dependentId, dto),
    );
  }
  @Get('medications/:id')
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    return medicationTreatmentView(await this.medications.findTreatment(user.id, dependentId, id));
  }
  @Patch('medications/:id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateMedicationTreatmentDto,
  ) {
    return medicationTreatmentView(
      await this.medications.updateTreatment(user.id, dependentId, id, dto),
    );
  }
  @Delete('medications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dependentId', uuid) dependentId: string,
    @Param('id', uuid) id: string,
  ) {
    await this.medications.deleteTreatment(user.id, dependentId, id);
  }
}
