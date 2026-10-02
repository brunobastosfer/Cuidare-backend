import type { Consent } from '../../domain/models/consent.model';
export function consentView(consent: Consent) {
  return {
    id: consent.id,
    dependentId: consent.dependentId,
    type: consent.type,
    policyVersion: consent.policyVersion,
    acceptedAt: consent.acceptedAt,
    revokedAt: consent.revokedAt,
  };
}
