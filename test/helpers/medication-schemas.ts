import { z } from 'zod';
export const medicationSchema = z
  .object({
    id: z.uuid(),
    dependentId: z.uuid(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export const medicationTreatmentSchema = z
  .object({
    id: z.uuid(),
    dependentId: z.uuid(),
    medicationId: z.uuid(),
    medication: medicationSchema,
    dosage: z.string(),
    unit: z.string(),
    frequency: z.string(),
    route: z.string().nullable(),
    startDate: z.string(),
    endDate: z.string().nullable(),
    continuousUse: z.boolean(),
    instructions: z.string().nullable(),
    prescribedBy: z.string().nullable(),
    reason: z.string().nullable(),
    notes: z.string().nullable(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'SUSPENDED']),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
