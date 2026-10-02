import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ApiRequest } from '../../common/types/request.types';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import {
  MALWARE_SCANNER_REPOSITORY,
  type MalwareScannerRepository,
} from '../../repository/malware-scanner.repository';
@Injectable()
export class DocumentUploadGuard implements CanActivate {
  constructor(
    private readonly authorization: DependentAuthorizationService,
    @Inject(MALWARE_SCANNER_REPOSITORY) private readonly scanner: MalwareScannerRepository,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ApiRequest>(),
      dependentId = request.params.dependentId;
    if (typeof dependentId !== 'string' || !isUUID(dependentId, '4'))
      throw new BadRequestException('Identificador inválido.');
    if (!request.user) return false;
    // Antes de Multer ler/alocar o corpo; service revalida após I/O externo.
    await this.authorization.requireRole(request.user.id, dependentId, ['OWNER', 'EDITOR']);
    if (!this.scanner.configured)
      throw new ServiceUnavailableException('Verificação de arquivos indisponível.');
    return true;
  }
}
