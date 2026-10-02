import { z } from 'zod';
export const consentPoliciesSchema = z
  .record(
    z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
    z
      .object({
        version: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/),
        scope: z.enum(['ACCOUNT', 'DEPENDENT']),
        consentBased: z.boolean().default(false),
      })
      .strict(),
  )
  .refine((policies) => Object.keys(policies).length <= 20);

export type ConsentPolicies = z.infer<typeof consentPoliciesSchema>;

export function parseConsentPolicies(value: string): ConsentPolicies {
  try {
    return consentPoliciesSchema.parse(JSON.parse(value) as unknown);
  } catch {
    // Nunca inclui o valor de configuração no erro.
    throw new Error('CONSENT_POLICIES deve conter um objeto JSON de políticas válido.');
  }
}
