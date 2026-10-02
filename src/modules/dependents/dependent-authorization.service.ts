import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import {
  DEPENDENT_ACCESS_REPOSITORY,
  type DependentAccessRepository,
} from '../../repository/dependent-access.repository';

@Injectable()
export class DependentAuthorizationService {
  constructor(
    @Inject(DEPENDENT_ACCESS_REPOSITORY) private readonly access: DependentAccessRepository,
  ) {}
  async requireRole(
    userId: string,
    dependentId: string,
    roles: DependentAccessRole[],
    repository = this.access,
  ) {
    const access = await repository.findActive(userId, dependentId);
    if (!access || !roles.includes(access.role))
      throw new NotFoundException('Dependente não encontrado.');
    return access;
  }
}
