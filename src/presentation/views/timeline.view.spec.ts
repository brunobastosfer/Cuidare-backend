import { randomUUID } from 'node:crypto';
import { syntheticEvent } from '../../../test/helpers/timeline-fixture';
import { timelineEventView, timelinePageView } from './timeline.view';
test('view não retorna propriedades extras do domínio/repository', () => {
  const event = syntheticEvent(randomUUID(), 'TEST_A', 1);
  const withInternal = { ...event, internal: 'not-public' };
  expect(timelineEventView(withInternal)).toEqual(event);
  expect(timelinePageView({ items: [withInternal], nextCursor: null, hasMore: false })).toEqual({
    items: [event],
    nextCursor: null,
    hasMore: false,
  });
});
