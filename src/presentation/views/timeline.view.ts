import type { TimelineEvent, TimelinePage } from '../../domain/models/timeline-event.model';
export function timelineEventView(event: TimelineEvent) {
  return {
    id: event.id,
    dependentId: event.dependentId,
    type: event.type,
    title: event.title,
    eventDate: event.eventDate,
    summary: event.summary,
    sourceId: event.sourceId,
    sourceType: event.sourceType,
    createdAt: event.createdAt,
  };
}
export function timelinePageView(page: TimelinePage) {
  return {
    items: page.items.map(timelineEventView),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}
