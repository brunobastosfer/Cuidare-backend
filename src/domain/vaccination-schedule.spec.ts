import {
  expectedVaccinationDate,
  evaluateVaccinationSchedule,
  referenceApplies,
} from './vaccination-schedule';
import { vaccinationFixture } from '../../test/helpers/vaccination-fixture';
test.each([
  ['2020-02-29', 12, 0, '2021-02-28'],
  ['2020-01-31', 1, 0, '2020-02-29'],
  ['2021-01-31', 1, 1, '2021-03-01'],
  ['2020-02-29', 48, 0, '2024-02-29'],
  ['0001-01-01', 0, 0, '0001-01-01'],
  ['9999-12-31', 0, 0, '9999-12-31'],
] as const)('aritmética civil UTC %s + meses/dias', (birth, months, days, expected) => {
  const date = new Date(birth);
  expect(expectedVaccinationDate(date, months, days).toISOString().slice(0, 10)).toBe(expected);
  expect(date.toISOString().slice(0, 10)).toBe(birth);
});
test.each([
  [-1, 0],
  [1.5, 0],
  [1201, 0],
  [0, -1],
  [0, 367],
  [0, 0.1],
])('recusa regra não representável %s/%s', (months, days) => {
  expect(() => expectedVaccinationDate(new Date('2020-01-01'), months, days)).toThrow();
});
test.each(['invalid', '2020-01-01T12:00:00Z', '0000-01-01'])(
  'recusa nascimento inválido %s',
  (value) => {
    expect(() => expectedVaccinationDate(new Date(value), 0, 0)).toThrow();
    expect(() => expectedVaccinationDate(new Date(value), 12, 0)).toThrow();
  },
);
test('recusa overflow de data', () => {
  expect(() => expectedVaccinationDate(new Date('9999-12-31'), 1, 0)).toThrow();
});
test('vigência é inclusiva e aberta quando não há término', () => {
  const ref = { validFrom: new Date('2020-01-01'), validUntil: new Date('2020-12-31') };
  for (const date of ['2020-01-01', '2020-12-31'])
    expect(referenceApplies(ref, new Date(date))).toBe(true);
  for (const date of ['2019-12-31', '2021-01-01'])
    expect(referenceApplies(ref, new Date(date))).toBe(false);
  expect(referenceApplies({ ...ref, validUntil: null }, new Date('2099-01-01'))).toBe(true);
});
test('estados comparam dia civil; no dia previsto não considera atrasada', async () => {
  const f = await vaccinationFixture();
  for (const [date, status] of [
    ['2021-02-27', 'PREVISTA'],
    ['2021-02-28', 'PREVISTA'],
    ['2021-03-01', 'ATRASADA'],
  ])
    expect(
      evaluateVaccinationSchedule(f.dependent.birthDate, new Date(date!), [f.rule], [])[0]?.status,
    ).toBe(status);
});
test('correspondência exata de referência e dose; só considera registros até asOf', async () => {
  const f = await vaccinationFixture();
  const evaluate = (records: (typeof f.record)[]) =>
    evaluateVaccinationSchedule(
      f.dependent.birthDate,
      new Date('2021-02-28'),
      [f.rule],
      records,
    )[0]!;
  expect(evaluate([{ ...f.record, vaccineId: 'different-version' }]).status).toBe('PREVISTA');
  expect(evaluate([{ ...f.record, dose: 'OTHER-DOSE' }]).status).toBe('PREVISTA');
  expect(evaluate([{ ...f.record, administeredAt: new Date('2021-03-01') }]).status).toBe(
    'PREVISTA',
  );
  expect(evaluate([f.record, { ...f.record, id: 'duplicate' }])).toMatchObject({
    status: 'REGISTRADA',
    recordIds: [f.record.id, 'duplicate'],
  });
});
