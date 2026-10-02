import { z } from 'zod';
import type { RetentionDays } from '../domain/models/data-retention.model';
const days = z.number().int().min(0).max(36500).nullable().default(null);
const retentionSchema = z
  .object({
    ACCOUNT: days,
    DEPENDENT: days,
    CARE_TASK: days,
    CONSENT: days,
    AUDIT: days,
    AUTH: days,
    ABUSE: days,
    PRIVACY: days,
    MEDICATION: days,
    APPOINTMENT: days,
    DOCUMENT: days,
    VACCINATION: days,
    EDUCATION: days,
  })
  .strict();
export type { RetentionDays } from '../domain/models/data-retention.model';
export function parseRetentionDays(value: string): RetentionDays {
  try {
    return retentionSchema.parse(JSON.parse(value) as unknown);
  } catch {
    throw new Error('PRIVACY_RETENTION_DAYS deve conter categorias e dias válidos.');
  }
}
