import { isBirthDate } from './birth-date';
const today = new Date('2026-10-01T12:00:00Z');
test.each(['2020-02-29', '2000-02-29', '0001-01-01', '2026-10-01'])(
  'aceita data civil válida %s',
  (date) => {
    expect(isBirthDate(date, today)).toBe(true);
  },
);
test.each([
  '2021-02-29',
  '2020-02-30',
  '1900-02-29',
  '2026-10-02',
  '0000-01-01',
  '2020-13-01',
  '2020-1-01',
  '2020-01-01T00:00:00Z',
  null,
])('recusa data inválida/futura %s', (date) => {
  expect(isBirthDate(date, today)).toBe(false);
});
