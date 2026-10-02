import type {
  TimelineOrder,
  TimelinePosition,
  TimelineEvent,
  TimelineReadQuery,
} from './models/timeline-event.model';

export function compareTimelinePositions(
  a: TimelinePosition,
  b: TimelinePosition,
  order: TimelineOrder,
): number {
  const byDate = a.eventDate.getTime() - b.eventDate.getTime();
  const byId = a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
  return (byDate || byId) * (order === 'asc' ? 1 : -1);
}
export function matchesTimelineQuery(event: TimelineEvent, query: TimelineReadQuery): boolean {
  return (
    event.dependentId === query.dependentId &&
    (!query.type || event.type === query.type) &&
    (!query.from || event.eventDate >= query.from) &&
    (!query.to || event.eventDate <= query.to) &&
    event.createdAt <= query.snapshotAt &&
    (!query.after || compareTimelinePositions(event, query.after, query.order) > 0)
  );
}
