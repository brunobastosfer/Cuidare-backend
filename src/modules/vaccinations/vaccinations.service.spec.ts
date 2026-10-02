import { randomUUID } from 'node:crypto';
import { vaccinationFixture, vaccinationDto } from '../../../test/helpers/vaccination-fixture';
import { timelineQuery } from '../../../test/helpers/timeline-fixture';
import {
  vaccinationView,
  vaccineCatalogView,
  vaccinationStatusView,
} from '../../presentation/views/vaccination.view';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
import { RepositoryRetryableError } from '../../repository/errors/repository.error';
test('CRUD auditado, projeções explícitas e soft delete sem eliminar referência', async () => {
  const f = await vaccinationFixture();
  expect(
    (await f.vaccinations.list(f.user.id, f.dependent.id, { limit: 20, offset: 0 })).length,
  ).toBe(1);
  const updated = await f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, {
    institutionName: 'Instituição privada',
    batchNumber: 'Lote privado',
    notes: 'Texto sensível',
  });
  expect(vaccinationView(updated)).toMatchObject({
    administeredAt: '2021-02-28',
    notes: 'Texto sensível',
    vaccine: { sourceVersion: 'test-v1' },
  });
  expect(vaccinationView(updated)).not.toHaveProperty('createdByUserId');
  expect(vaccineCatalogView(f.vaccine)).not.toHaveProperty('reviewedAt');
  expect(JSON.stringify(f.foundation.auditRows)).not.toMatch(
    /Texto sensível|Instituição privada|Lote privado/,
  );
  expect(f.foundation.auditRows.at(-1)?.metadata).toEqual({
    changedFields: ['institutionName', 'batchNumber', 'notes'],
  });
  await f.vaccinations.delete(f.user.id, f.dependent.id, f.record.id);
  await expect(f.vaccinations.find(f.user.id, f.dependent.id, f.record.id)).rejects.toThrow(
    'Registro não encontrado.',
  );
  expect(f.foundation.vaccinations.rows.get(f.record.id)?.deletedAt).toBeInstanceOf(Date);
  expect(f.foundation.vaccinations.catalog.has(f.vaccine.id)).toBe(true);
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as DependentAccessRole[])(
  'papel %s: leitura, escrita e exclusão mínimas',
  async (role) => {
    const f = await vaccinationFixture(),
      other = await f.users.create({
        name: 'Fixture',
        email: 'role@example.com',
        passwordHash: 'fixture',
      });
    await f.foundation.dependentAccess.create({
      userId: other.id,
      dependentId: f.dependent.id,
      role,
      relationship: null,
    });
    await f.vaccinations.find(other.id, f.dependent.id, f.record.id);
    await f.vaccinations.scheduleStatus(other.id, f.dependent.id, {
      scheduleId: f.schedule.id,
      asOf: '2021-03-01',
    });
    if (role === 'VIEWER') {
      await expect(
        f.vaccinations.create(other.id, f.dependent.id, vaccinationDto(f.vaccine.id)),
      ).rejects.toThrow();
      await expect(
        f.vaccinations.update(other.id, f.dependent.id, f.record.id, { notes: 'X' }),
      ).rejects.toThrow();
    } else {
      await f.vaccinations.create(other.id, f.dependent.id, vaccinationDto(f.vaccine.id));
      await f.vaccinations.update(other.id, f.dependent.id, f.record.id, { notes: 'X' });
    }
    if (role === 'OWNER') await f.vaccinations.delete(other.id, f.dependent.id, f.record.id);
    else
      await expect(f.vaccinations.delete(other.id, f.dependent.id, f.record.id)).rejects.toThrow();
  },
);
test('estranho, vínculo revogado, conta bloqueada e dependente excluído não acessam', async () => {
  const f = await vaccinationFixture(),
    other = await f.users.create({
      name: 'Fixture',
      email: 'other@example.com',
      passwordHash: 'fixture',
    });
  for (const id of [f.dependent.id, randomUUID()])
    await expect(f.vaccinations.find(other.id, id, f.record.id)).rejects.toThrow(
      'Dependente não encontrado.',
    );
  const access = [...f.foundation.accessRows.values()][0]!;
  f.foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
  await expect(
    f.vaccinations.list(f.user.id, f.dependent.id, { limit: 1, offset: 0 }),
  ).rejects.toThrow();
  f.foundation.accessRows.set(access.id, access);
  await f.users.closeAccount(f.user.id, f.user.credentialVersion, new Date());
  await expect(
    f.vaccinations.scheduleStatus(f.user.id, f.dependent.id, { scheduleId: f.schedule.id }),
  ).rejects.toThrow();
});
test('registro de outro dependente não pode ser lido, editado ou excluído', async () => {
  const f = await vaccinationFixture(),
    second = await f.foundation.dependents.create({
      fullName: 'Fixture',
      preferredName: null,
      birthDate: new Date('2020-01-01'),
      createdByUserId: f.user.id,
    });
  await f.foundation.dependentAccess.create({
    userId: f.user.id,
    dependentId: second.id,
    role: 'OWNER',
    relationship: null,
  });
  await expect(f.vaccinations.find(f.user.id, second.id, f.record.id)).rejects.toThrow();
  await expect(
    f.vaccinations.update(f.user.id, second.id, f.record.id, { notes: 'X' }),
  ).rejects.toThrow();
  await expect(f.vaccinations.delete(f.user.id, second.id, f.record.id)).rejects.toThrow();
});
test.each(['2019-01-01', '2999-01-01', '2021-02-29', '2021-02-28T00:00:00Z'])(
  'recusa data não aceitável %s sem gravar/auditar',
  async (date) => {
    const f = await vaccinationFixture(),
      before = f.foundation.auditRows.length;
    await expect(
      f.vaccinations.create(
        f.user.id,
        f.dependent.id,
        vaccinationDto(f.vaccine.id, { administeredAt: date }),
      ),
    ).rejects.toThrow();
    await expect(
      f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, { administeredAt: date }),
    ).rejects.toThrow();
    expect(f.foundation.vaccinations.rows.size).toBe(1);
    expect(f.foundation.auditRows.length).toBe(before);
  },
);
test('referência não revisada/retirada bloqueia novo registro, preservando histórico', async () => {
  const f = await vaccinationFixture();
  for (const change of [
    { reviewedAt: null },
    { reviewedAt: new Date('2999-01-01') },
    { deletedAt: new Date() },
  ]) {
    f.foundation.vaccinations.catalog.set(f.vaccine.id, { ...f.vaccine, ...change });
    await expect(
      f.vaccinations.create(f.user.id, f.dependent.id, vaccinationDto(f.vaccine.id)),
    ).rejects.toThrow('Referência não encontrada.');
    expect(
      (await f.vaccinations.find(f.user.id, f.dependent.id, f.record.id)).vaccine.sourceVersion,
    ).toBe('test-v1');
  }
  await f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, {
    notes: 'Correção do histórico',
  });
});
test('vigência da referência e do calendário é validada; versão selecionada é retornada', async () => {
  const f = await vaccinationFixture();
  f.foundation.vaccinations.catalog.set(f.vaccine.id, {
    ...f.vaccine,
    validUntil: new Date('2020-12-31'),
  });
  await expect(
    f.vaccinations.create(f.user.id, f.dependent.id, vaccinationDto(f.vaccine.id)),
  ).rejects.toThrow('Referência fora de vigência');
  f.foundation.vaccinations.catalog.set(f.vaccine.id, f.vaccine);
  const result = await f.vaccinations.scheduleStatus(f.user.id, f.dependent.id, {
    scheduleId: f.schedule.id,
    asOf: '2021-03-01',
  });
  expect(vaccinationStatusView(result.schedule, result.asOf, result.items)).toMatchObject({
    schedule: { source: f.schedule.source, sourceVersion: 'test-v1' },
    items: [{ status: 'REGISTRADA' }],
  });
  f.foundation.vaccinations.schedules.set(f.schedule.id, {
    ...f.schedule,
    validUntil: new Date('2020-12-31'),
  });
  await expect(
    f.vaccinations.scheduleStatus(f.user.id, f.dependent.id, {
      scheduleId: f.schedule.id,
      asOf: '2021-03-01',
    }),
  ).rejects.toThrow('Calendário fora de vigência');
});
test('calendário vazio, retirado ou com referência retirada falha fechado', async () => {
  const f = await vaccinationFixture();
  f.foundation.vaccinations.doses.clear();
  await expect(
    f.vaccinations.scheduleStatus(f.user.id, f.dependent.id, { scheduleId: f.schedule.id }),
  ).rejects.toThrow('Referências do calendário');
  f.foundation.vaccinations.doses.set(f.rule.id, f.rule);
  f.foundation.vaccinations.catalog.set(f.vaccine.id, { ...f.vaccine, deletedAt: new Date() });
  await expect(
    f.vaccinations.scheduleStatus(f.user.id, f.dependent.id, { scheduleId: f.schedule.id }),
  ).rejects.toThrow('Referências do calendário');
  await expect(
    f.vaccinations.listScheduleDoses(f.schedule.id, { limit: 10, offset: 0 }),
  ).rejects.toThrow();
  f.foundation.vaccinations.schedules.set(f.schedule.id, { ...f.schedule, deletedAt: new Date() });
  await expect(f.vaccinations.findSchedule(f.schedule.id)).rejects.toThrow(
    'Referência não encontrada.',
  );
});
test.each(['rules', 'records'])(
  'limite %s recusa comparação truncada com 413',
  async (collection) => {
    const f = await vaccinationFixture(),
      previous = process.env.VACCINATION_STATUS_MAX_ITEMS;
    try {
      f.config.set('VACCINATION_STATUS_MAX_ITEMS', 1);
      if (collection === 'rules')
        f.foundation.vaccinations.doses.set('extra', { ...f.rule, id: 'extra', dose: 'OTHER' });
      else await f.vaccinations.create(f.user.id, f.dependent.id, vaccinationDto(f.vaccine.id));
      await expect(
        f.vaccinations.scheduleStatus(f.user.id, f.dependent.id, { scheduleId: f.schedule.id }),
      ).rejects.toMatchObject({ status: 413 });
    } finally {
      if (previous === undefined) delete process.env.VACCINATION_STATUS_MAX_ITEMS;
      else process.env.VACCINATION_STATUS_MAX_ITEMS = previous;
    }
  },
);
test('erro da auditoria reverte criação, alteração e exclusão', async () => {
  const f = await vaccinationFixture(),
    spy = jest
      .spyOn(f.foundation.auditLogs, 'append')
      .mockRejectedValue(new Error('audit unavailable'));
  await expect(
    f.vaccinations.create(f.user.id, f.dependent.id, vaccinationDto(f.vaccine.id)),
  ).rejects.toThrow('audit unavailable');
  await expect(
    f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, { notes: 'X' }),
  ).rejects.toThrow('audit unavailable');
  await expect(f.vaccinations.delete(f.user.id, f.dependent.id, f.record.id)).rejects.toThrow(
    'audit unavailable',
  );
  expect(f.foundation.vaccinations.rows.size).toBe(1);
  expect(f.foundation.vaccinations.rows.get(f.record.id)).toMatchObject({
    notes: null,
    deletedAt: null,
  });
  spy.mockRestore();
});
test('documento exige mesmo dependente e continua protegido após exclusão', async () => {
  const f = await vaccinationFixture();
  const doc = await f.foundation.documents.create({
    dependentId: f.dependent.id,
    category: 'VACCINE_RECORD',
    title: 'Fixture',
    description: null,
    storageKey: randomUUID() + '.bin',
    originalFileName: 'test.pdf',
    mimeType: 'application/pdf',
    size: 20,
    checksum: 'a'.repeat(64),
    scannedAt: new Date(),
    createdByUserId: f.user.id,
    documentDate: null,
  });
  await expect(
    f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, { documentId: randomUUID() }),
  ).rejects.toThrow('Documento não encontrado.');
  f.foundation.documents.rows.set(doc.id, { ...doc, dependentId: randomUUID() });
  await expect(
    f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, { documentId: doc.id }),
  ).rejects.toThrow('Documento não encontrado.');
  f.foundation.documents.rows.set(doc.id, doc);
  const attached = await f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, {
    documentId: doc.id,
  });
  expect(vaccinationView(attached).documentId).toBe(doc.id);
  f.foundation.documents.rows.set(doc.id, { ...doc, deletedAt: new Date() });
  const edited = await f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, {
    notes: 'Correção',
  });
  expect(vaccinationView(edited).documentId).toBeNull();
  await expect(
    f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, { documentId: doc.id }),
  ).rejects.toThrow();
  expect(
    (await f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, { documentId: null }))
      .documentId,
  ).toBeNull();
});
test('timeline usa evento civil mínimo, filtro, cursor e não traz detalhes da vacina', async () => {
  const f = await vaccinationFixture(),
    timeline = f.service(f.sources);
  const page = await timeline.list(
    f.user.id,
    f.dependent.id,
    timelineQuery({ type: 'VACCINATION_RECORDED' }),
  );
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({
    id: 'vaccination-recorded:' + f.record.id,
    title: 'Vacinação informada',
    summary: null,
    eventDate: new Date('2021-02-28'),
  });
  expect(JSON.stringify(page)).not.toContain(f.vaccine.name);
  await f.vaccinations.delete(f.user.id, f.dependent.id, f.record.id);
  expect((await timeline.list(f.user.id, f.dependent.id, timelineQuery())).items).toEqual([]);
});
test('privacidade exporta somente OWNER selecionado e exclui soft delete', async () => {
  const f = await vaccinationFixture();
  expect((await f.foundation.privacy.readExport(f.user.id, [], 100)).vaccinations).toEqual([]);
  const selected = await f.foundation.privacy.readExport(f.user.id, [f.dependent.id], 100);
  expect(selected.vaccinations).toHaveLength(1);
  await f.vaccinations.delete(f.user.id, f.dependent.id, f.record.id);
  expect(
    (await f.foundation.privacy.readExport(f.user.id, [f.dependent.id], 100)).vaccinations,
  ).toEqual([]);
});
test('atualização vazia e datas asOf impossíveis falham', async () => {
  const f = await vaccinationFixture();
  await expect(f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, {})).rejects.toThrow();
  for (const asOf of ['2019-01-01', '2999-01-01', 'not-date'])
    await expect(
      f.vaccinations.scheduleStatus(f.user.id, f.dependent.id, { scheduleId: f.schedule.id, asOf }),
    ).rejects.toThrow();
});
test('retry transacional não duplica registro/auditoria ou acrescenta campos internos', async () => {
  const f = await vaccinationFixture(),
    run = f.foundation.run.bind(f.foundation),
    before = f.foundation.auditRows.length;
  jest
    .spyOn(f.foundation, 'run')
    .mockImplementationOnce(async <T>(operation: (r: TransactionRepositories) => Promise<T>) => {
      try {
        await run(async (r) => {
          await operation(r);
          throw new RepositoryRetryableError();
        });
      } catch (error) {
        if (!(error instanceof RepositoryRetryableError)) throw error;
      }
      return run(operation);
    });
  await f.vaccinations.update(f.user.id, f.dependent.id, f.record.id, {
    dose: 'TEST-CORRECTION',
    notes: null,
  });
  expect(f.foundation.vaccinations.rows.size).toBe(1);
  expect(f.foundation.auditRows.length).toBe(before + 1);
  expect(f.foundation.auditRows.at(-1)?.metadata.changedFields).toEqual(['dose', 'notes']);
});
test('dependente excluído perde leitura, escrita, status e timeline', async () => {
  const f = await vaccinationFixture();
  await f.foundation.dependents.softDeleteForUser(f.dependent.id, f.user.id);
  await expect(f.vaccinations.find(f.user.id, f.dependent.id, f.record.id)).rejects.toThrow();
  await expect(
    f.vaccinations.create(f.user.id, f.dependent.id, vaccinationDto(f.vaccine.id)),
  ).rejects.toThrow();
  await expect(
    f.vaccinations.scheduleStatus(f.user.id, f.dependent.id, { scheduleId: f.schedule.id }),
  ).rejects.toThrow();
  await expect(
    f.service(f.sources).list(f.user.id, f.dependent.id, timelineQuery()),
  ).rejects.toThrow();
});
