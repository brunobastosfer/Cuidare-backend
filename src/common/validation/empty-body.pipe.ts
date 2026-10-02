import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
@Injectable()
export class EmptyBodyPipe implements PipeTransform<unknown, void> {
  transform(value: unknown): void {
    if (value === undefined) return;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 0
    )
      throw new BadRequestException('Esta operação não aceita campos no corpo.');
  }
}
