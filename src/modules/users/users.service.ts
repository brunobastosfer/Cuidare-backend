import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { USER_REPOSITORY, type UserRepository } from '../../repository/user.repository';
@Injectable()
export class UsersService {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}
  async me(id: string) {
    const user = await this.users.findById(id);
    if (!user || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Autenticação necessária.');
    return user;
  }
}
