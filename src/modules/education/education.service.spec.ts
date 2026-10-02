import { randomUUID } from 'node:crypto';
import {
  educationFixture,
  enrollmentDto,
  reportDto,
} from '../../../test/helpers/education-fixture';
import { timelineQuery } from '../../../test/helpers/timeline-fixture';
import { enrollmentView, schoolReportView } from '../../presentation/views/education.view';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
import { RepositoryRetryableError } from '../../repository/errors/repository.error';
test('CRUD, projeção e auditoria sem nomes/conteúdo', async () => {
  const f = await educationFixture(),
    s = f.education,
    u = f.user.id,
    d = f.dependent.id;
  expect(await s.listEnrollments(u, d, { limit: 1, offset: 0 })).toHaveLength(1);
  expect(await s.findEnrollment(u, d, f.enrollment.id)).toEqual(f.enrollment);
  expect(
    enrollmentView(
      await s.updateEnrollment(u, d, f.enrollment.id, {
        schoolName: 'Nome privado',
        grade: 'G',
        className: 'C',
        endDate: '2025-05-01',
      }),
    ),
  ).toMatchObject({
    schoolName: 'Nome privado',
    grade: 'G',
    className: 'C',
    endDate: '2025-05-01',
  });
  expect(
    schoolReportView(
      await s.updateReport(u, d, f.report.id, {
        title: 'Título privado',
        summary: 'Resumo privado',
        observations: 'Observação privada',
      }),
    ),
  ).toMatchObject({
    title: 'Título privado',
    summary: 'Resumo privado',
    observations: 'Observação privada',
    reportDate: '2025-06-01',
  });
  expect(enrollmentView(f.enrollment)).not.toHaveProperty('createdByUserId');
  expect(schoolReportView(f.report)).not.toHaveProperty('enrollment');
  expect(JSON.stringify(f.foundation.auditRows)).not.toMatch(
    /Nome privado|Título privado|Resumo privado|Observação privada/,
  );
  expect(f.foundation.auditRows.at(-1)?.metadata).toEqual({
    changedFields: ['title', 'summary', 'observations'],
  });
  await s.deleteReport(u, d, f.report.id);
  await expect(s.findReport(u, d, f.report.id)).rejects.toThrow();
  expect(await s.listReports(u, d, { limit: 10, offset: 0 })).toEqual([]);
  expect(f.foundation.education.reports.get(f.report.id)?.deletedAt).toBeInstanceOf(Date);
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as DependentAccessRole[])(
  'papel %s nas duas entidades',
  async (role) => {
    const f = await educationFixture(),
      b = await f.users.create({
        name: 'Fixture',
        email: 'role@example.com',
        passwordHash: 'fixture',
      });
    await f.foundation.dependentAccess.create({
      userId: b.id,
      dependentId: f.dependent.id,
      role,
      relationship: null,
    });
    const s = f.education,
      d = f.dependent.id;
    await s.findEnrollment(b.id, d, f.enrollment.id);
    await s.findReport(b.id, d, f.report.id);
    const writes = [
      () => s.createEnrollment(b.id, d, enrollmentDto()),
      () => s.createReport(b.id, d, reportDto()),
      () => s.updateEnrollment(b.id, d, f.enrollment.id, { grade: 'G' }),
      () => s.updateReport(b.id, d, f.report.id, { summary: 'S' }),
    ];
    for (const write of writes)
      if (role === 'VIEWER') await expect(write()).rejects.toThrow();
      else await write();
    for (const remove of [
      () => s.deleteEnrollment(b.id, d, f.enrollment.id),
      () => s.deleteReport(b.id, d, f.report.id),
    ])
      if (role === 'OWNER') await remove();
      else await expect(remove()).rejects.toThrow();
  },
);
test.each(['stranger', 'revoked', 'blocked', 'deleted'] as const)(
  'escopo indisponível %s bloqueia todas operações',
  async (mode) => {
    const f = await educationFixture();
    let u = f.user.id;
    if (mode === 'stranger')
      u = (
        await f.users.create({
          name: 'Fixture',
          email: 'other@example.com',
          passwordHash: 'fixture',
        })
      ).id;
    if (mode === 'revoked') {
      const a = [...f.foundation.accessRows.values()][0]!;
      f.foundation.accessRows.set(a.id, { ...a, revokedAt: new Date() });
    }
    if (mode === 'blocked') await f.users.closeAccount(u, f.user.credentialVersion, new Date());
    if (mode === 'deleted') await f.foundation.dependents.softDeleteForUser(f.dependent.id, u);
    const d = f.dependent.id,
      s = f.education;
    for (const op of [
      () => s.listEnrollments(u, d, { limit: 10, offset: 0 }),
      () => s.findEnrollment(u, d, f.enrollment.id),
      () => s.createEnrollment(u, d, enrollmentDto()),
      () => s.updateEnrollment(u, d, f.enrollment.id, { grade: 'G' }),
      () => s.deleteEnrollment(u, d, f.enrollment.id),
      () => s.listReports(u, d, { limit: 10, offset: 0 }),
      () => s.findReport(u, d, f.report.id),
      () => s.createReport(u, d, reportDto()),
      () => s.updateReport(u, d, f.report.id, { title: 'T' }),
      () => s.deleteReport(u, d, f.report.id),
    ])
      await expect(op()).rejects.toThrow('Dependente não encontrado.');
  },
);
test('outro dependente, mesmo OWNER, não permite IDs cruzados', async () => {
  const f = await educationFixture(),
    u = f.user.id;
  const d = await f.foundation.dependents.create({
    fullName: 'Fixture',
    preferredName: null,
    birthDate: new Date('2020-01-01'),
    createdByUserId: u,
  });
  await f.foundation.dependentAccess.create({
    userId: u,
    dependentId: d.id,
    role: 'OWNER',
    relationship: null,
  });
  for (const op of [
    () => f.education.findEnrollment(u, d.id, f.enrollment.id),
    () => f.education.updateEnrollment(u, d.id, f.enrollment.id, { grade: 'G' }),
    () => f.education.deleteEnrollment(u, d.id, f.enrollment.id),
    () => f.education.findReport(u, d.id, f.report.id),
    () => f.education.updateReport(u, d.id, f.report.id, { title: 'T' }),
    () => f.education.deleteReport(u, d.id, f.report.id),
    () => f.education.createReport(u, d.id, reportDto({ enrollmentId: f.enrollment.id })),
    () => f.education.updateReport(u, f.dependent.id, f.report.id, { documentId: randomUUID() }),
  ])
    await expect(op()).rejects.toThrow();
});
test.each(['2019-01-01', '2025-02-29', '2025-01-01T00:00:00Z', '0000-01-01'])(
  'período civil inválido %s',
  async (date) => {
    const f = await educationFixture();
    await expect(
      f.education.createEnrollment(f.user.id, f.dependent.id, enrollmentDto({ startDate: date })),
    ).rejects.toThrow();
    await expect(
      f.education.updateEnrollment(f.user.id, f.dependent.id, f.enrollment.id, { startDate: date }),
    ).rejects.toThrow();
  },
);
test('planejamento futuro, ano declarado e PATCH período completo', async () => {
  const f = await educationFixture(),
    s = f.education,
    u = f.user.id,
    d = f.dependent.id;
  const planned = await s.createEnrollment(
    u,
    d,
    enrollmentDto({ startDate: '2999-01-01', schoolYear: 2027, endDate: '2999-02-01' }),
  );
  expect(planned.schoolYear).toBe(2027);
  await expect(s.updateEnrollment(u, d, planned.id, { startDate: '2999-03-01' })).rejects.toThrow();
  await s.updateEnrollment(u, d, planned.id, {
    startDate: '2999-03-01',
    endDate: null,
    grade: null,
    className: null,
  });
  await expect(
    s.createEnrollment(u, d, enrollmentDto({ endDate: '2024-01-01' })),
  ).rejects.toThrow();
  for (const schoolYear of [0, 10000, 2.5])
    await expect(s.createEnrollment(u, d, enrollmentDto({ schoolYear }))).rejects.toThrow();
  const past = await s.createEnrollment(u, d, enrollmentDto({ endDate: '2025-01-02' }));
  await s.createReport(u, d, reportDto({ enrollmentId: past.id, reportDate: '2025-06-01' }));
});
test.each(['2019-01-01', '2999-01-01', '2025-02-29', '2025-01-01T01:00:00Z'])(
  'data inválida %s não grava relatório',
  async (reportDate) => {
    const f = await educationFixture(),
      before = f.foundation.auditRows.length;
    await expect(
      f.education.createReport(f.user.id, f.dependent.id, reportDto({ reportDate })),
    ).rejects.toThrow();
    await expect(
      f.education.updateReport(f.user.id, f.dependent.id, f.report.id, { reportDate }),
    ).rejects.toThrow();
    expect(f.foundation.education.reports.size).toBe(1);
    expect(f.foundation.auditRows).toHaveLength(before);
  },
);
test('relatório independente, reassociação, detach e matrícula excluída', async () => {
  const f = await educationFixture(),
    s = f.education,
    u = f.user.id,
    d = f.dependent.id;
  const other = await s.createEnrollment(u, d, enrollmentDto());
  await s.updateReport(u, d, f.report.id, {
    enrollmentId: other.id,
    documentId: null,
    summary: null,
    observations: null,
  });
  await s.deleteEnrollment(u, d, other.id);
  expect(schoolReportView(await s.findReport(u, d, f.report.id)).enrollmentId).toBeNull();
  expect(f.foundation.education.reports.get(f.report.id)?.enrollmentId).toBe(other.id);
  await s.updateReport(u, d, f.report.id, { summary: 'Correção' });
  await expect(s.updateReport(u, d, f.report.id, { enrollmentId: other.id })).rejects.toThrow();
  await expect(s.createReport(u, d, reportDto({ enrollmentId: other.id }))).rejects.toThrow();
  await s.updateReport(u, d, f.report.id, { enrollmentId: null });
  expect(schoolReportView(await s.findReport(u, d, f.report.id)).enrollmentId).toBeNull();
  expect((await f.service(f.sources).list(u, d, timelineQuery())).items).toHaveLength(1);
});
test.each(['enrollment', 'report'] as const)('PATCH vazio %s', async (kind) => {
  const f = await educationFixture();
  await expect(
    kind === 'enrollment'
      ? f.education.updateEnrollment(f.user.id, f.dependent.id, f.enrollment.id, {})
      : f.education.updateReport(f.user.id, f.dependent.id, f.report.id, {}),
  ).rejects.toThrow('Informe ao menos');
});
test.each([
  'createEnrollment',
  'updateEnrollment',
  'deleteEnrollment',
  'createReport',
  'updateReport',
  'deleteReport',
] as const)('rollback de %s se auditoria falha', async (op) => {
  const f = await educationFixture(),
    s = f.education,
    u = f.user.id,
    d = f.dependent.id;
  const enrollments = [...f.foundation.education.enrollments.values()],
    reports = [...f.foundation.education.reports.values()],
    audit = f.foundation.auditRows.length;
  const spy = jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValueOnce(new Error('fail'));
  const operations = {
    createEnrollment: () => s.createEnrollment(u, d, enrollmentDto()),
    updateEnrollment: () => s.updateEnrollment(u, d, f.enrollment.id, { schoolName: 'Changed' }),
    deleteEnrollment: () => s.deleteEnrollment(u, d, f.enrollment.id),
    createReport: () => s.createReport(u, d, reportDto()),
    updateReport: () => s.updateReport(u, d, f.report.id, { title: 'Changed' }),
    deleteReport: () => s.deleteReport(u, d, f.report.id),
  };
  await expect(operations[op]()).rejects.toThrow('fail');
  spy.mockRestore();
  expect([...f.foundation.education.enrollments.values()]).toEqual(enrollments);
  expect([...f.foundation.education.reports.values()]).toEqual(reports);
  expect(f.foundation.auditRows).toHaveLength(audit);
});
test('retry sem mutações capturadas ou auditoria duplicada', async () => {
  const f = await educationFixture(),
    run = f.foundation.run.bind(f.foundation),
    failure = jest
      .spyOn(f.foundation.auditLogs, 'append')
      .mockRejectedValueOnce(new RepositoryRetryableError());
  const spy = jest
    .spyOn(f.foundation, 'run')
    .mockImplementation(async <T>(op: (r: TransactionRepositories) => Promise<T>) => {
      try {
        return await run(op);
      } catch (e) {
        if (!(e instanceof RepositoryRetryableError)) throw e;
        return run(op);
      }
    });
  await f.education.updateReport(f.user.id, f.dependent.id, f.report.id, { summary: 'Correção' });
  expect(f.foundation.auditRows.filter((a) => a.action === 'SCHOOL_REPORT_UPDATED')).toHaveLength(
    1,
  );
  spy.mockRestore();
  failure.mockRestore();
});
test.each(['asc', 'desc'] as const)('timeline %s keyset, DATE e snapshot', async (order) => {
  const f = await educationFixture(),
    s = f.education,
    u = f.user.id,
    d = f.dependent.id;
  for (let i = 0; i < 3; i++)
    await s.createReport(
      u,
      d,
      reportDto({
        summary: 'Segredo',
        observations: 'Segredo',
        reportDate: i === 0 ? '2025-06-02' : '2025-06-01',
      }),
    );
  const timeline = f.service([f.provider, ...f.sources]);
  let page = await timeline.list(
    u,
    d,
    timelineQuery({ limit: 1, order, type: 'SCHOOL_REPORT_RECORDED' }),
  );
  const ids = page.items.map((e) => e.sourceId);
  // Garantir instante distinto da fronteira inclusiva do snapshot.
  const late = await s.createReport(u, d, reportDto({ reportDate: '2025-01-01' }));
  f.foundation.education.reports.set(late.id, { ...late, createdAt: new Date(Date.now() + 1000) });
  while (page.nextCursor) {
    page = await timeline.list(
      u,
      d,
      timelineQuery({ limit: 1, order, type: 'SCHOOL_REPORT_RECORDED', cursor: page.nextCursor }),
    );
    ids.push(...page.items.map((e) => e.sourceId));
  }
  expect(ids).toHaveLength(4);
  expect(new Set(ids).size).toBe(4);
  const filtered = await timeline.list(
    u,
    d,
    timelineQuery({
      from: '2025-06-01T00:00:00.001Z',
      to: '2025-06-02T00:00:00.000Z',
      type: 'SCHOOL_REPORT_RECORDED',
    }),
  );
  expect(filtered.items).toHaveLength(1);
  expect(JSON.stringify(filtered)).not.toMatch(/Segredo|Escola fictícia|Relatório fictício/);
});
