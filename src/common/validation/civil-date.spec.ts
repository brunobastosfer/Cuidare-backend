import { isCivilDate } from './civil-date';
test.each(['2020-02-29', '2026-10-01', '9999-12-31', '0001-01-01'])(
  'aceita data civil real %s sem associar fuso',
  (value) => {
    expect(isCivilDate(value)).toBe(true);
  },
);
test.each([
  '2021-02-29',
  '2026-02-30',
  '0000-01-01',
  '2026-01-01T00:00:00Z',
  '2026-13-01',
  '2026-00-01',
  '2026-1-01',
  null,
  123,
  {},
  '',
])('rejeita data inválida %j', (value) => expect(isCivilDate(value)).toBe(false));
