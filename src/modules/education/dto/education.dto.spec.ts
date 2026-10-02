import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
  CreateReportDto,
  UpdateReportDto,
} from './education.dto';
import { enrollmentDto, reportDto } from '../../../../test/helpers/education-fixture';
const options = { whitelist: true, forbidNonWhitelisted: true };
test('normalização, opcionais null e PATCH nullable', async () => {
  const e = plainToInstance(
    CreateEnrollmentDto,
    enrollmentDto({ schoolName: '  Escola  ', grade: null, className: null, endDate: null }),
  );
  expect(await validate(e, options)).toEqual([]);
  expect(e.schoolName).toBe('Escola');
  const r = plainToInstance(
    CreateReportDto,
    reportDto({
      title: '  Título  ',
      summary: null,
      observations: null,
      enrollmentId: null,
      documentId: null,
    }),
  );
  expect(await validate(r, options)).toEqual([]);
  expect(r.title).toBe('Título');
  expect(
    await validate(
      plainToInstance(UpdateEnrollmentDto, { grade: null, className: null, endDate: null }),
      options,
    ),
  ).toEqual([]);
  expect(
    await validate(
      plainToInstance(UpdateReportDto, {
        summary: null,
        observations: null,
        enrollmentId: null,
        documentId: null,
      }),
      options,
    ),
  ).toEqual([]);
});
test.each([
  { schoolName: '' },
  { schoolName: ' ' },
  { schoolName: null },
  { schoolName: 'x'.repeat(161) },
  { schoolYear: '2025' },
  { schoolYear: 0 },
  { schoolYear: 10000 },
  { schoolYear: 2.5 },
  { schoolYear: null },
  { grade: 'x'.repeat(121) },
  { className: 'x'.repeat(81) },
  { startDate: '2025-02-29' },
  { startDate: null },
  { endDate: '2025-01-01T00:00:00Z' },
  { dependentId: randomUUID() },
  { createdByUserId: randomUUID() },
  { deletedAt: null },
])('matrícula rejeita %j', async (override) => {
  expect(
    (
      await validate(
        plainToInstance(CreateEnrollmentDto, { ...enrollmentDto(), ...override }),
        options,
      )
    ).length,
  ).toBeGreaterThan(0);
});
test.each([
  { title: '' },
  { title: ' ' },
  { title: null },
  { title: 'x'.repeat(161) },
  { reportDate: null },
  { reportDate: '2025-02-29' },
  { reportDate: '2025-01-01T00:00:00Z' },
  { summary: 2 },
  { summary: 'x'.repeat(2001) },
  { observations: 'x'.repeat(2001) },
  { enrollmentId: 'bad' },
  { documentId: 'bad' },
  { dependentId: randomUUID() },
  { createdAt: '2025-01-01' },
  { status: 'APPROVED' },
])('relatório rejeita %j', async (override) => {
  expect(
    (await validate(plainToInstance(CreateReportDto, { ...reportDto(), ...override }), options))
      .length,
  ).toBeGreaterThan(0);
});
test.each([
  { schoolName: null },
  { schoolYear: null },
  { startDate: null },
  { dependentId: randomUUID() },
])('PATCH matrícula %j', async (data) => {
  expect(
    (await validate(plainToInstance(UpdateEnrollmentDto, data), options)).length,
  ).toBeGreaterThan(0);
});
test.each([{ title: null }, { reportDate: null }, { createdByUserId: randomUUID() }])(
  'PATCH relatório %j',
  async (data) => {
    expect(
      (await validate(plainToInstance(UpdateReportDto, data), options)).length,
    ).toBeGreaterThan(0);
  },
);
