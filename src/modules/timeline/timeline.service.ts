import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TIMELINE_EVENT_TYPES, type TimelinePage } from '../../domain/models/timeline-event.model';
import {
  TIMELINE_SOURCES,
  type TimelineSource,
  type TimelineSourceQuery,
} from '../../repository/timeline-source.repository';
import {
  UNIT_OF_WORK_REPOSITORY,
  type UnitOfWorkRepository,
} from '../../repository/unit-of-work.repository';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
import type { ListTimelineDto } from './dto/list-timeline.dto';
import { TimelineCursorService } from './timeline-cursor.service';
import { compareTimelinePositions, matchesTimelineQuery } from '../../domain/timeline-query';

// Fail closed se um provider futuro violar o contrato de projeção.
const eventSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+:[a-zA-Z0-9_-]{1,128}$/),
    dependentId: z.uuid(),
    type: z.enum(TIMELINE_EVENT_TYPES),
    title: z.string().min(1).max(120),
    eventDate: z.date(),
    summary: z.string().max(240).nullable(),
    sourceId: z.uuid(),
    sourceType: z.string().regex(/^[A-Z][A-Z0-9_]{0,49}$/),
    createdAt: z.date(),
  })
  .strict();
@Injectable()
export class TimelineService {
  constructor(
    @Inject(UNIT_OF_WORK_REPOSITORY) private readonly transactions: UnitOfWorkRepository,
    private readonly authorization: DependentAuthorizationService,
    private readonly cursors: TimelineCursorService,
    @Inject(TIMELINE_SOURCES) private readonly sources: readonly TimelineSource[],
  ) {
    const sourceTypes = this.sources.map((source) => source.sourceType);
    if (new Set(sourceTypes).size !== sourceTypes.length)
      throw new Error('Fonte de timeline duplicada.');
  }
  async list(userId: string, dependentId: string, dto: ListTimelineDto): Promise<TimelinePage> {
    const from = dto.from === undefined ? null : new Date(dto.from);
    const to = dto.to === undefined ? null : new Date(dto.to);
    if (
      (from && !Number.isFinite(from.getTime())) ||
      (to && !Number.isFinite(to.getTime())) ||
      (from && to && from > to) ||
      !Number.isInteger(dto.limit) ||
      dto.limit < 1 ||
      dto.limit > 100 ||
      !['asc', 'desc'].includes(dto.order) ||
      (dto.type !== undefined && !TIMELINE_EVENT_TYPES.includes(dto.type))
    )
      throw new BadRequestException('Filtros de timeline inválidos.');
    const scope = { userId, dependentId, from, to, type: dto.type ?? null, order: dto.order };
    const state = dto.cursor ? this.cursors.decode(dto.cursor, scope) : this.cursors.start();
    const query: TimelineSourceQuery = { ...scope, ...state, take: dto.limit + 1 };
    return this.transactions.run(async (repositories) => {
      await this.authorization.requireRole(
        userId,
        dependentId,
        ['OWNER', 'EDITOR', 'VIEWER'],
        repositories.dependentAccess,
      );
      const candidates = [];
      for (const source of this.sources) {
        if (query.type && !source.types.includes(query.type)) continue;
        const events = await source.list(query, repositories);
        if (events.length > query.take) throw new Error('Fonte de timeline excedeu o limite.');
        for (const raw of events) {
          const event = eventSchema.parse(raw);
          if (
            event.sourceType !== source.sourceType ||
            !source.types.includes(event.type) ||
            !matchesTimelineQuery(event, query)
          )
            throw new Error('Fonte de timeline fora de escopo.');
          candidates.push(event);
        }
      }
      candidates.sort((a, b) => compareTimelinePositions(a, b, query.order));
      if (new Set(candidates.map((event) => event.id)).size !== candidates.length)
        throw new Error('Evento de timeline duplicado.');
      const hasMore = candidates.length > dto.limit;
      const items = candidates.slice(0, dto.limit);
      const last = items.at(-1);
      return {
        items,
        hasMore,
        nextCursor: hasMore && last ? this.cursors.encode(scope, state, last) : null,
      };
    });
  }
}
