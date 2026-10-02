import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  CreateRecommendationDto,
  UpdateRecommendationDto,
} from './appointment.dto';
import { appointmentDto, recommendationDto } from '../../../../test/helpers/appointment-fixture';
test('normaliza textos, aceita nullable e não atribui estado implicitamente do cliente', async () => {
  const a = plainToInstance(
    CreateAppointmentDto,
    appointmentDto({ reason: '  Motivo  ', notes: null }),
  );
  expect(await validate(a)).toEqual([]);
  expect(a.reason).toBe('Motivo');
  const r = plainToInstance(CreateRecommendationDto, recommendationDto({ status: 'IN_PROGRESS' }));
  expect(await validate(r)).toEqual([]);
});
test.each([
  { date: null },
  { date: '2026-01-01' },
  { date: '2026-02-30T00:00:00Z' },
  { reason: null },
  { reason: '' },
  { reason: ' '.repeat(5) },
  { reason: 'a'.repeat(501) },
  { notes: 42 },
  { specialty: 'a'.repeat(121) },
  { professionalName: [] },
  { institutionName: 'a'.repeat(161) },
  { followUpDate: '2026-01-01T00:00:00-03:00' },
  { deletedAt: null },
  { dependentId: 'foreign' },
  { recommendations: [] },
  { completedAt: '2026-01-01T00:00:00Z' },
])('DTO consulta rejeita %j', async (override) => {
  expect(
    (
      await validate(plainToInstance(CreateAppointmentDto, { ...appointmentDto(), ...override }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).length,
  ).toBeGreaterThan(0);
});
test.each([
  { title: null },
  { title: ' ' },
  { description: '' },
  { description: 'a'.repeat(2001) },
  { status: null },
  { status: 'DONE' },
  { startDate: null },
  { startDate: '2026-02-29' },
  { endDate: '2026-01-01T00:00:00Z' },
  { appointmentId: 'foreign' },
  { dependentId: 'foreign' },
  { completedAt: null },
])('DTO recomendação rejeita %j', async (override) => {
  expect(
    (
      await validate(
        plainToInstance(CreateRecommendationDto, { ...recommendationDto(), ...override }),
        { whitelist: true, forbidNonWhitelisted: true },
      )
    ).length,
  ).toBeGreaterThan(0);
});
test.each([
  ['reason', UpdateAppointmentDto],
  ['date', UpdateAppointmentDto],
  ['status', UpdateRecommendationDto],
  ['title', UpdateRecommendationDto],
  ['description', UpdateRecommendationDto],
  ['startDate', UpdateRecommendationDto],
] as const)('PATCH não admite null obrigatório: %s', async (key, Dto) => {
  const row =
    Dto === UpdateAppointmentDto
      ? plainToInstance(UpdateAppointmentDto, { [key]: null })
      : plainToInstance(UpdateRecommendationDto, { [key]: null });
  expect((await validate(row)).length).toBeGreaterThan(0);
});
