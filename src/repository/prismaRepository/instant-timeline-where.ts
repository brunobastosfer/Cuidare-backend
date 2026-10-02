import type { TimelineSourceQuery } from '../timeline-source.repository';
// Keyset global para TIMESTAMPTZ: namespace participa do desempate antes de LIMIT.
export function instantTimelineWhere(query: TimelineSourceQuery, column: string, prefix: string) {
  const conditions: Record<string, unknown>[] = [];
  if (query.from) conditions.push({ [column]: { gte: query.from } });
  if (query.to) conditions.push({ [column]: { lte: query.to } });
  if (query.after) {
    const op = query.order === 'asc' ? 'gt' : 'lt';
    const cursorPrefix = query.after.id.slice(0, query.after.id.indexOf(':') + 1);
    const alternatives: Record<string, unknown>[] = [{ [column]: { [op]: query.after.eventDate } }];
    if (prefix === cursorPrefix) {
      const id = query.after.id.slice(prefix.length);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
        throw new Error('Posição de timeline incompatível.');
      alternatives.push({ [column]: query.after.eventDate, id: { [op]: id } });
    } else if (query.order === 'asc' ? prefix > cursorPrefix : prefix < cursorPrefix)
      alternatives.push({ [column]: query.after.eventDate });
    conditions.push({ OR: alternatives });
  }
  return conditions;
}
