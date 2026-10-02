import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateVaccinationDto,
  UpdateVaccinationDto,
  ListVaccineSchedulesDto,
  VaccinationScheduleStatusDto,
} from './vaccination.dto';
const data = { vaccineId: randomUUID(), dose: 'TEST', administeredAt: '2020-02-29' },
  options = { whitelist: true, forbidNonWhitelisted: true };
test('normalização de textos e nullable somente nos opcionais', async () => {
  const dto = plainToInstance(CreateVaccinationDto, {
    ...data,
    dose: '  TEST  ',
    institutionName: null,
    notes: null,
    documentId: null,
  });
  expect(await validate(dto, options)).toEqual([]);
  expect(dto.dose).toBe('TEST');
  expect(
    await validate(
      plainToInstance(UpdateVaccinationDto, { notes: null, documentId: null }),
      options,
    ),
  ).toEqual([]);
});
test.each([
  { vaccineId: 'bad' },
  { vaccineId: null },
  { dose: '' },
  { dose: '   ' },
  { dose: null },
  { dose: 'a'.repeat(41) },
  { administeredAt: null },
  { administeredAt: '2021-02-29' },
  { administeredAt: '2020-01-01T00:00:00Z' },
  { institutionName: 'a'.repeat(161) },
  { batchNumber: 'a'.repeat(81) },
  { notes: 123 },
  { notes: 'a'.repeat(2001) },
  { documentId: 'bad' },
  { dependentId: randomUUID() },
  { createdByUserId: randomUUID() },
  { deletedAt: null },
  { status: 'REGISTRADA' },
  { vaccine: {} },
])('create recusa dados inválidos ou mass assignment %j', async (override) => {
  expect(
    (await validate(plainToInstance(CreateVaccinationDto, { ...data, ...override }), options))
      .length,
  ).toBeGreaterThan(0);
});
test.each([
  { vaccineId: randomUUID() },
  { dose: null },
  { administeredAt: null },
  { dependentId: randomUUID() },
  { createdAt: '2020-01-01' },
])('PATCH recusa identidade e nulos obrigatórios %j', async (override) => {
  expect(
    (await validate(plainToInstance(UpdateVaccinationDto, override), options)).length,
  ).toBeGreaterThan(0);
});
test('consulta exige calendário explícito, tipo conhecido e não aceita campos extras', async () => {
  expect(
    await validate(
      plainToInstance(VaccinationScheduleStatusDto, {
        scheduleId: randomUUID(),
        asOf: '2020-01-01',
      }),
      options,
    ),
  ).toEqual([]);
  expect(
    (await validate(plainToInstance(VaccinationScheduleStatusDto, { asOf: '2020-01-01' }), options))
      .length,
  ).toBeGreaterThan(0);
  expect(
    (await validate(plainToInstance(ListVaccineSchedulesDto, { type: 'UNKNOWN' }), options)).length,
  ).toBeGreaterThan(0);
  expect(
    await validate(
      plainToInstance(ListVaccineSchedulesDto, { type: 'PRIVATE_COMPLEMENTARY' }),
      options,
    ),
  ).toEqual([]);
});
