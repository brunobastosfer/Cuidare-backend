import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import { OpaqueTokenService } from './opaque-token.service';
@Injectable()
export class AuthRateLimitService {
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly tokens: OpaqueTokenService,
    private readonly config: ConfigService,
  ) {}
  consume(action: string, identity: string, ip: string): Promise<boolean> {
    const login = action === 'LOGIN';
    const limits = [
      {
        key: this.tokens.rateKey(action + ':IDENTITY', identity.trim().toLowerCase()),
        max: this.config.getOrThrow<number>(
          login ? 'AUTH_LOGIN_IDENTITY_MAX' : 'AUTH_REQUEST_IDENTITY_MAX',
        ),
      },
      {
        key: this.tokens.rateKey(action + ':IP', ip),
        max: this.config.getOrThrow<number>('AUTH_IP_MAX'),
      },
    ];
    return this.transactions.run(async ({ authRateLimits }) => {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + this.config.getOrThrow<number>('AUTH_RATE_WINDOW_SECONDS') * 1000,
      );
      const buckets = await Promise.all(
        limits.map(async (limit) => ({ limit, bucket: await authRateLimits.find(limit.key) })),
      );
      if (
        buckets.some(
          ({ limit, bucket }) => bucket && bucket.expiresAt > now && bucket.count >= limit.max,
        )
      )
        return false;
      for (const { limit, bucket } of buckets) {
        const current =
          bucket && bucket.expiresAt > now
            ? bucket
            : { key: limit.key, count: 0, windowStartedAt: now, expiresAt };
        await authRateLimits.save({ ...current, count: current.count + 1 });
      }
      return true;
    });
  }
}
