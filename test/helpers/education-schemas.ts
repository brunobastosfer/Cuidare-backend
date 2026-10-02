import { z } from 'zod';
const common = {
  id: z.uuid(),
  dependentId: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
};
export const enrollmentSchema = z
  .object({
    ...common,
    schoolName: z.string(),
    schoolYear: z.number().int(),
    grade: z.string().nullable(),
    className: z.string().nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().nullable(),
  })
  .strict();
export const schoolReportSchema = z
  .object({
    ...common,
    enrollmentId: z.uuid().nullable(),
    title: z.string(),
    reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    summary: z.string().nullable(),
    observations: z.string().nullable(),
    documentId: z.uuid().nullable(),
  })
  .strict();
