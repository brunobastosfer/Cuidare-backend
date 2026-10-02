import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/request.types';
import { userView } from '../../presentation/views/user.view';
import { UsersService } from './users.service';
@ApiTags('Conta')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  async me(@CurrentUser() user: AuthenticatedUser) {
    return userView(await this.users.me(user.id));
  }
}
