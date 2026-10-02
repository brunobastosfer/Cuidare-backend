import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { TimelineFilters, TimelinePosition } from '../../domain/models/timeline-event.model';

const canonicalTimestamp = z.string().refine((value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const cursorSchema = z
  .object({
    v: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    snapshotAt: canonicalTimestamp,
    expiresAt: z.number().int().positive(),
    after: z
      .object({
        eventDate: canonicalTimestamp,
        id: z.string().regex(/^[a-z0-9-]+:[a-zA-Z0-9_-]{1,128}$/),
      })
      .strict(),
  })
  .strict();
export interface TimelineCursorScope extends TimelineFilters {
  userId: string;
  dependentId: string;
}
export interface TimelineCursorState {
  snapshotAt: Date;
  expiresAt: number;
  after: TimelinePosition | null;
}
@Injectable()
export class TimelineCursorService {
  constructor(private readonly config: ConfigService) {}
  start(now = Date.now()): TimelineCursorState {
    return { snapshotAt: new Date(now), expiresAt: now + 30 * 60 * 1000, after: null };
  }
  encode(scope: TimelineCursorScope, state: TimelineCursorState, after: TimelinePosition): string {
    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        scope: this.scopeHash(scope),
        snapshotAt: state.snapshotAt.toISOString(),
        expiresAt: state.expiresAt,
        after: { eventDate: after.eventDate.toISOString(), id: after.id },
      }),
    ).toString('base64url');
    return 'tl1.' + payload + '.' + this.mac('signature', payload).toString('base64url');
  }
  decode(token: string, scope: TimelineCursorScope, now = Date.now()): TimelineCursorState {
    try {
      if (token.length > 1024 || !/^tl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
        throw new Error();
      const [, payload, signature] = token.split('.');
      if (!payload || !signature) throw new Error();
      const expected = this.mac('signature', payload);
      const received = Buffer.from(signature, 'base64url');
      if (
        received.length !== expected.length ||
        received.toString('base64url') !== signature ||
        !timingSafeEqual(expected, received)
      )
        throw new Error();
      const decoded = cursorSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown,
      );
      const snapshotAt = new Date(decoded.snapshotAt);
      if (
        decoded.scope !== this.scopeHash(scope) ||
        decoded.expiresAt <= now ||
        snapshotAt.getTime() > now ||
        decoded.expiresAt !== snapshotAt.getTime() + 30 * 60 * 1000
      )
        throw new Error();
      return {
        snapshotAt,
        expiresAt: decoded.expiresAt,
        after: { eventDate: new Date(decoded.after.eventDate), id: decoded.after.id },
      };
    } catch {
      throw new BadRequestException('Cursor inválido ou expirado.');
    }
  }
  private scopeHash(scope: TimelineCursorScope): string {
    return this.mac(
      'scope',
      JSON.stringify([
        scope.userId,
        scope.dependentId,
        scope.from?.toISOString() ?? null,
        scope.to?.toISOString() ?? null,
        scope.type,
        scope.order,
      ]),
    ).toString('hex');
  }
  private mac(purpose: string, value: string): Buffer {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update('cuidare-timeline-v1\0' + purpose + '\0' + value)
      .digest();
  }
}
