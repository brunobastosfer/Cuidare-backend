import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type {
  VaccineCatalog,
  VaccineSchedule,
  VaccineScheduleDose,
} from '../../src/domain/models/vaccination.model';
import { VaccinationsService } from '../../src/modules/vaccinations/vaccinations.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { VaccinationTimelineSource } from '../../src/modules/vaccinations/vaccination-timeline.source';
import type { InMemoryVaccinations } from './in-memory-vaccinations';
import type { CreateVaccinationDto } from '../../src/modules/vaccinations/dto/vaccination.dto';
import { timelineFixture } from './timeline-fixture';
// Referências inventadas EXCLUSIVAMENTE para testes de software; não são conteúdo clínico.
export function referenceFixture(repo: InMemoryVaccinations) {
  const reference = {
    source: 'TEST_ONLY_NOT_CLINICAL',
    sourceVersion: 'test-v1',
    validFrom: new Date('2020-01-01'),
    validUntil: null,
    reviewedAt: new Date('2020-01-01'),
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
    deletedAt: null,
  };
  const vaccine: VaccineCatalog = {
    ...reference,
    id: randomUUID(),
    code: 'TEST-ONLY',
    name: 'Referência fictícia de teste',
  };
  const schedule: VaccineSchedule = {
    ...reference,
    id: randomUUID(),
    name: 'Calendário fictício sem uso clínico',
    type: 'PUBLIC',
    ruleModel: 'BIRTH_AGE_FIXED_V1',
  };
  const rule: VaccineScheduleDose = {
    id: randomUUID(),
    scheduleId: schedule.id,
    vaccineId: vaccine.id,
    dose: 'TEST-DOSE',
    dueAgeMonths: 12,
    dueAgeDays: 0,
    vaccine,
  };
  repo.catalog.set(vaccine.id, vaccine);
  repo.schedules.set(schedule.id, schedule);
  repo.doses.set(rule.id, rule);
  return { vaccine, schedule, rule };
}
export function vaccinationDto(
  vaccineId: string,
  overrides: Partial<CreateVaccinationDto> = {},
): CreateVaccinationDto {
  return { vaccineId, dose: 'TEST-DOSE', administeredAt: '2021-02-28', ...overrides };
}
export async function vaccinationFixture() {
  const f = await timelineFixture(),
    references = referenceFixture(f.foundation.vaccinations);
  const config = new ConfigService({ VACCINATION_STATUS_MAX_ITEMS: 1000 });
  const vaccinations = new VaccinationsService(
    f.foundation,
    f.authorization,
    new AuditService(),
    config,
  );
  const record = await vaccinations.create(
    f.user.id,
    f.dependent.id,
    vaccinationDto(references.vaccine.id),
  );
  return {
    ...f,
    ...references,
    config,
    vaccinations,
    record,
    sources: [new VaccinationTimelineSource()],
  };
}
