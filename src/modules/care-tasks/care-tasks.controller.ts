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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/request.types';
import { careTaskView } from '../../presentation/views/care-task.view';
import { CareTasksService } from './care-tasks.service';
import { CreateCareTaskDto } from './dto/create-care-task.dto';
import { ListCareTasksDto } from './dto/list-care-tasks.dto';
import { UpdateCareTaskDto } from './dto/update-care-task.dto';

@ApiTags('Cuidados')
@ApiBearerAuth()
@Controller('care-tasks')
export class CareTasksController {
  constructor(private readonly tasks: CareTasksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar os cuidados do usuário autenticado' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: ListCareTasksDto) {
    return (await this.tasks.list(user.id, pagination)).map(careTaskView);
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCareTaskDto) {
    return careTaskView(await this.tasks.create(user.id, dto));
  }

  @Get(':id')
  async find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return careTaskView(await this.tasks.find(id, user.id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCareTaskDto,
  ) {
    return careTaskView(await this.tasks.update(id, user.id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.tasks.remove(id, user.id);
  }
}
