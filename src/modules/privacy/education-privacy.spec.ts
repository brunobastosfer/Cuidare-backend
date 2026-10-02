import { privacyFixture } from '../../../test/helpers/privacy-fixture';
import { authPassword } from '../../../test/helpers/auth-fixture';
import { enrollmentDto, reportDto } from '../../../test/helpers/education-fixture';
import { EducationService } from '../education/education.service';
import { AuditService } from '../audit/audit.service';
import { DependentAuthorizationService } from '../dependents/dependent-authorization.service';
async function fixture() {
  const f = await privacyFixture(),
    education = new EducationService(
      f.foundation,
      new DependentAuthorizationService(f.foundation.dependentAccess),
      new AuditService(),
    );
  const enrollment = await education.createEnrollment(f.user.id, f.dependent.id, enrollmentDto()),
    report = await education.createReport(
      f.user.id,
      f.dependent.id,
      reportDto({ enrollmentId: enrollment.id, summary: 'Texto privado informado' }),
    );
  return { ...f, education, enrollment, report };
}
test('exportação 1.5 exige seleção OWNER, não inclui internos e preserva relatório independente', async () => {
  const f = await fixture(),
    dto = { format: 'JSON', password: authPassword } as const;
  const own = await f.privacy.export(f.user.id, dto);
  expect(own.schemaVersion).toBe('1.5');
  expect(own.data.schoolEnrollments).toEqual([]);
  expect(own.data.schoolReports).toEqual([]);
  await f.education.deleteEnrollment(f.user.id, f.dependent.id, f.enrollment.id);
  const selected = await f.privacy.export(f.user.id, { ...dto, dependentIds: [f.dependent.id] });
  expect(selected.data.schoolEnrollments).toEqual([]);
  expect(selected.data.schoolReports[0]).toMatchObject({
    id: f.report.id,
    enrollmentId: null,
    summary: 'Texto privado informado',
  });
  expect(JSON.stringify(selected)).not.toMatch(
    /deletedAt|createdByUserId|credentialVersion|storageKey/,
  );
  await f.education.deleteReport(f.user.id, f.dependent.id, f.report.id);
  expect(
    (await f.privacy.export(f.user.id, { ...dto, dependentIds: [f.dependent.id] })).data
      .schoolReports,
  ).toEqual([]);
});
test.each(['schoolEnrollments', 'schoolReports'] as const)(
  'limite %s falha fechado sem recibo/audit parcial',
  async (collection) => {
    const f = await fixture(),
      snapshot = await f.foundation.privacy.readExport(f.user.id, [f.dependent.id], 1000),
      before = f.foundation.auditRows.length;
    jest.spyOn(f.foundation.privacy, 'readExport').mockResolvedValue({
      ...snapshot,
      [collection]: Array.from({ length: 1001 }, () => snapshot[collection][0]!),
    });
    await expect(
      f.privacy.export(f.user.id, {
        format: 'JSON',
        password: authPassword,
        dependentIds: [f.dependent.id],
      }),
    ).rejects.toMatchObject({ status: 413 });
    expect(f.foundation.exportRows.size).toBe(0);
    expect(f.foundation.auditRows).toHaveLength(before);
  },
);
