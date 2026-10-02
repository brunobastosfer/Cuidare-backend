import { z } from 'zod';
const provenance = {
  source: z.string(),
  sourceVersion: z.string(),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
};
export const vaccineSchema = z
  .object({ id: z.uuid(), code: z.string(), name: z.string(), ...provenance })
  .strict();
export const scheduleSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: z.enum(['PUBLIC', 'PRIVATE_COMPLEMENTARY']),
    ruleModel: z.literal('BIRTH_AGE_FIXED_V1'),
    ...provenance,
  })
  .strict();
export const vaccinationSchema = z
  .object({
    id: z.uuid(),
    dependentId: z.uuid(),
    vaccine: vaccineSchema,
    dose: z.string(),
    administeredAt: z.string(),
    institutionName: z.string().nullable(),
    batchNumber: z.string().nullable(),
    notes: z.string().nullable(),
    documentId: z.uuid().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export const vaccinationStatusSchema = z
  .object({
    schedule: scheduleSchema,
    asOf: z.string(),
    notice: z.string(),
    items: z.array(
      z
        .object({
          ruleId: z.uuid(),
          vaccine: vaccineSchema,
          dose: z.string(),
          expectedDate: z.string(),
          status: z.enum(['REGISTRADA', 'PREVISTA', 'ATRASADA']),
          recordIds: z.array(z.uuid()),
        })
        .strict(),
    ),
  })
  .strict();
