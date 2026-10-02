import type {
  VaccineReference,
  VaccineScheduleDose,
  VaccinationStatusItem,
  DependentVaccination,
} from './models/vaccination.model';
export function referenceApplies(
  reference: Pick<VaccineReference, 'validFrom' | 'validUntil'>,
  at: Date,
) {
  return reference.validFrom <= at && (!reference.validUntil || at <= reference.validUntil);
}
// Matemática civil, não regra clínica: meses com clamp no último dia e depois dias.
export function expectedVaccinationDate(birthDate: Date, months: number, days: number) {
  if (
    !Number.isInteger(months) ||
    months < 0 ||
    months > 1200 ||
    !Number.isInteger(days) ||
    days < 0 ||
    days > 366
  )
    throw new Error('Regra temporal não suportada.');
  const result = new Date(birthDate),
    day = result.getUTCDate();
  if (
    !Number.isFinite(result.getTime()) ||
    result.getUTCFullYear() < 1 ||
    result.getUTCFullYear() > 9999 ||
    result.toISOString().slice(11) !== '00:00:00.000Z'
  )
    throw new Error('Data civil inválida.');
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(result);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  result.setUTCDate(Math.min(day, last.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + days);
  if (result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999)
    throw new Error('Data fora da faixa suportada.');
  return result;
}
export function evaluateVaccinationSchedule(
  birthDate: Date,
  asOf: Date,
  rules: VaccineScheduleDose[],
  records: Pick<DependentVaccination, 'id' | 'vaccineId' | 'dose' | 'administeredAt'>[],
): VaccinationStatusItem[] {
  const matching = new Map<string, string[]>();
  for (const record of records) {
    if (record.administeredAt > asOf) continue;
    const key = record.vaccineId + '\0' + record.dose;
    const ids = matching.get(key) ?? [];
    ids.push(record.id);
    matching.set(key, ids);
  }
  return rules.map((rule) => {
    const expectedDate = expectedVaccinationDate(birthDate, rule.dueAgeMonths, rule.dueAgeDays);
    const recordIds = matching.get(rule.vaccineId + '\0' + rule.dose) ?? [];
    return {
      rule,
      expectedDate,
      recordIds,
      status: recordIds.length ? 'REGISTRADA' : expectedDate < asOf ? 'ATRASADA' : 'PREVISTA',
    };
  });
}
