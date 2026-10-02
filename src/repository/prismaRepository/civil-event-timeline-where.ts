import type { TimelineSourceQuery } from '../timeline-source.repository';
const floorDate = (date: Date) => new Date(date.toISOString().slice(0, 10) + 'T00:00:00.000Z');
const ceilDate = (date: Date) => {
  const floor = floorDate(date);
  return new Date(floor.getTime() + (date.getTime() === floor.getTime() ? 0 : 86400000));
};
// DATE corresponde à meia-noite UTC. Filtro com hora não deve perder precisão.
export function civilEventTimelineWhere(
  query: TimelineSourceQuery,
  column: string,
  prefix: string,
) {
  const conditions: Record<string, unknown>[] = [];
  if (query.from) conditions.push({ [column]: { gte: ceilDate(query.from) } });
  if (query.to) conditions.push({ [column]: { lte: floorDate(query.to) } });
  if (query.after) {
    const day = floorDate(query.after.eventDate),
      exact = day.getTime() === query.after.eventDate.getTime();
    const alternatives: Record<string, unknown>[] = [
      { [column]: { [query.order === 'asc' ? 'gt' : exact ? 'lt' : 'lte']: day } },
    ];
    if (exact) {
      const cursorPrefix = query.after.id.slice(0, query.after.id.indexOf(':') + 1);
      if (prefix === cursorPrefix) {
        const id = query.after.id.slice(prefix.length);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
          throw new Error('Posição de timeline incompatível.');
        alternatives.push({ [column]: day, id: { [query.order === 'asc' ? 'gt' : 'lt']: id } });
      } else if (query.order === 'asc' ? prefix > cursorPrefix : prefix < cursorPrefix)
        alternatives.push({ [column]: day });
    }
    conditions.push({ OR: alternatives });
  }
  return conditions;
}
