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
import { dependentView } from '../../presentation/views/dependent.view';
import { DependentsService } from './dependents.service';
import { CreateDependentDto } from './dto/create-dependent.dto';
import { UpdateDependentDto } from './dto/update-dependent.dto';
@ApiTags('Dependentes')
@ApiBearerAuth()
@Controller('dependents')
export class DependentsController {
  constructor(private readonly dependents: DependentsService) {}
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationDto) {
    return (await this.dependents.list(user.id, pagination)).map(dependentView);
  }
  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDependentDto) {
    return dependentView(await this.dependents.create(user.id, dto));
  }
  @Get(':id')
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return dependentView(await this.dependents.find(id, user.id));
  }
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDependentDto,
  ) {
    return dependentView(await this.dependents.update(id, user.id, dto));
  }
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.dependents.remove(id, user.id);
  }
}
