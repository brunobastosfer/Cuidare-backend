export const TIMELINE_EVENT_TYPES = [
  'DEPENDENT_CREATED',
  'MEDICATION_STARTED',
  'MEDICATION_COMPLETED',
  'APPOINTMENT_RECORDED',
  'MEDICAL_RECOMMENDATION_RECORDED',
  'MEDICAL_RECOMMENDATION_COMPLETED',
  'DOCUMENT_UPLOADED',
  'VACCINATION_RECORDED',
  'SCHOOL_REPORT_RECORDED',
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];
export type TimelineOrder = 'asc' | 'desc';

// Projeção de leitura; não é uma entidade persistida nem um payload clínico.
export interface TimelineEvent {
  id: string;
  dependentId: string;
  type: TimelineEventType;
  title: string;
  eventDate: Date;
  summary: string | null;
  sourceId: string;
  sourceType: string;
  createdAt: Date;
}
export interface TimelinePosition {
  eventDate: Date;
  id: string;
}
export interface TimelineFilters {
  from: Date | null;
  to: Date | null;
  type: TimelineEventType | null;
  order: TimelineOrder;
}
export interface TimelineReadQuery extends TimelineFilters {
  userId: string;
  dependentId: string;
  snapshotAt: Date;
  after: TimelinePosition | null;
  take: number;
}
export interface TimelinePage {
  items: TimelineEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}
