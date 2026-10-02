import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { TimelineEvent } from '../../src/domain/models/timeline-event.model';
import { compareTimelinePositions, matchesTimelineQuery } from '../../src/domain/timeline-query';
import { DependentAuthorizationService } from '../../src/modules/dependents/dependent-authorization.service';
import { DependentTimelineSource } from '../../src/modules/dependents/dependent-timeline.source';
import { ListTimelineDto } from '../../src/modules/timeline/dto/list-timeline.dto';
import { TimelineCursorService } from '../../src/modules/timeline/timeline-cursor.service';
import { TimelineService } from '../../src/modules/timeline/timeline.service';
import type { TimelineSource } from '../../src/repository/timeline-source.repository';
import { InMemoryFoundation } from './in-memory-foundation';
import { InMemoryUserRepository } from './in-memory.repositories';

export function timelineQuery(overrides: Partial<ListTimelineDto> = {}) {
  return Object.assign(new ListTimelineDto(), overrides);
}
export async function timelineFixture() {
  const users = new InMemoryUserRepository();
  const foundation = new InMemoryFoundation(users);
  const user = await users.create({
    name: 'Fixture',
    email: 'timeline@example.com',
    passwordHash: 'fixture-no-login',
  });
  const dependent = await foundation.dependents.create({
    fullName: 'Não expor na timeline',
    preferredName: 'Não expor',
    birthDate: new Date('2020-02-29'),
    createdByUserId: user.id,
  });
  await foundation.dependentAccess.create({
    userId: user.id,
    dependentId: dependent.id,
    role: 'OWNER',
    relationship: null,
  });
  const authorization = new DependentAuthorizationService(foundation.dependentAccess);
  const cursors = new TimelineCursorService(
    new ConfigService({ JWT_SECRET: 'timeline-test-key-'.repeat(4) }),
  );
  const provider = new DependentTimelineSource();
  const service = (sources: TimelineSource[] = [provider]) =>
    new TimelineService(foundation, authorization, cursors, sources);
  return { users, foundation, user, dependent, authorization, cursors, provider, service };
}
// Somente fixtures para testar agregação. Não representam eventos clínicos reais.
export function syntheticEvent(
  dependentId: string,
  sourceType: string,
  sequence: number,
  eventDate = '2026-01-01T00:00:00.000Z',
): TimelineEvent {
  const sourceId = randomUUID();
  return {
    id: sourceType.toLowerCase().replaceAll('_', '-') + ':' + sequence.toString().padStart(3, '0'),
    dependentId,
    type: 'DEPENDENT_CREATED',
    title: 'Fixture',
    summary: null,
    sourceId,
    sourceType,
    eventDate: new Date(eventDate),
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
  };
}
export function syntheticSource(sourceType: string, rows: TimelineEvent[]): TimelineSource {
  return {
    sourceType,
    types: ['DEPENDENT_CREATED'],
    list: (query) =>
      Promise.resolve(
        rows
          .filter((event) => matchesTimelineQuery(event, query))
          .sort((a, b) => compareTimelinePositions(a, b, query.order))
          .slice(0, query.take),
      ),
  };
}
