export interface Consent {
  id: string;
  userId: string;
  dependentId: string | null;
  type: string;
  policyVersion: string;
  acceptedAt: Date;
  revokedAt: Date | null;
  consentBased: boolean;
}
export type CreateConsent = Pick<Consent, 'userId' | 'dependentId' | 'type' | 'policyVersion'> & {
  consentBased?: boolean;
};
