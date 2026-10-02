import { z } from 'zod';
import { RECOMMENDATION_STATUSES } from '../../src/domain/models/appointment.model';
export const appointmentSchema = z
  .object({
    id: z.uuid(),
    dependentId: z.uuid(),
    date: z.string(),
    specialty: z.string().nullable(),
    professionalName: z.string().nullable(),
    institutionName: z.string().nullable(),
    reason: z.string(),
    notes: z.string().nullable(),
    followUpDate: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export const recommendationSchema = z
  .object({
    id: z.uuid(),
    dependentId: z.uuid(),
    appointmentId: z.uuid(),
    title: z.string(),
    description: z.string(),
    status: z.enum(RECOMMENDATION_STATUSES),
    startDate: z.string(),
    endDate: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
