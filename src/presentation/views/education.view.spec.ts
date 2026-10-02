import { educationFixture } from '../../../test/helpers/education-fixture';
import { enrollmentView, schoolReportView } from './education.view';
test('projeções enumeradas não propagam internos ou propriedades extras', async () => {
  const f = await educationFixture();
  const e = enrollmentView({
    ...f.enrollment,
    passwordHash: 'secret',
    deletedBy: 'secret',
  } as Parameters<typeof enrollmentView>[0]);
  const r = schoolReportView({
    ...f.report,
    storageKey: 'secret',
    checksum: 'secret',
    score: 100,
  } as Parameters<typeof schoolReportView>[0]);
  expect(Object.keys(e).sort()).toEqual(
    [
      'id',
      'dependentId',
      'schoolName',
      'schoolYear',
      'grade',
      'className',
      'startDate',
      'endDate',
      'createdAt',
      'updatedAt',
    ].sort(),
  );
  expect(Object.keys(r).sort()).toEqual(
    [
      'id',
      'dependentId',
      'enrollmentId',
      'title',
      'reportDate',
      'summary',
      'observations',
      'documentId',
      'createdAt',
      'updatedAt',
    ].sort(),
  );
  expect(JSON.stringify({ e, r })).not.toMatch(/secret|score|deletedAt|createdByUserId/);
});
test('matrícula/documento ausente ou excluído esconde só referência pública', async () => {
  const f = await educationFixture(),
    id = f.enrollment.id;
  expect(
    schoolReportView({ ...f.report, documentId: id, document: { id, deletedAt: null } }).documentId,
  ).toBe(id);
  expect(
    schoolReportView({
      ...f.report,
      documentId: id,
      document: { id, deletedAt: new Date() },
      enrollment: { id, deletedAt: new Date() },
    }),
  ).toMatchObject({ enrollmentId: null, documentId: null, title: f.report.title });
  expect(
    schoolReportView({ ...f.report, enrollment: null, document: null, documentId: id }),
  ).toMatchObject({ enrollmentId: null, documentId: null });
});
