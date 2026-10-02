import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class PublicResponseService {
  constructor(private readonly config: ConfigService) {}
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      const remaining =
        this.config.getOrThrow<number>('AUTH_RESPONSE_MIN_MS') - (performance.now() - start);
      if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }
}
