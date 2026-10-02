import { randomUUID } from 'node:crypto';
import { medicationFixture, treatmentDto } from '../../../test/helpers/medication-fixture';
import { timelineQuery } from '../../../test/helpers/timeline-fixture';
import { RepositoryRetryableError } from '../../repository/errors/repository.error';

test('separa produto/tratamento, preserva instrução textual, campos públicos e audit minimizado', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id),
  );
  expect(row).toMatchObject({
    dependentId: f.dependent.id,
    medicationId: f.product.id,
    dosage: '1 gota por kg',
    continuousUse: false,
    status: 'ACTIVE',
    completedAt: null,
    endDate: null,
  });
  expect((await f.medications.findTreatment(f.user.id, f.dependent.id, row.id)).medication.id).toBe(
    f.product.id,
  );
  expect(
    await f.medications.listTreatments(f.user.id, f.dependent.id, { limit: 1, offset: 0 }),
  ).toHaveLength(1);
  expect(
    await f.medications.listTreatments(f.user.id, f.dependent.id, { limit: 1, offset: 1 }),
  ).toEqual([]);
  expect(
    await f.medications.listProducts(f.user.id, f.dependent.id, { limit: 1, offset: 0 }),
  ).toEqual([f.product]);
  expect(await f.medications.findProduct(f.user.id, f.dependent.id, f.product.id)).toEqual(
    f.product,
  );
  await f.medications.updateProduct(f.user.id, f.dependent.id, f.product.id, {
    name: 'Nome corrigido',
  });
  expect(
    (await f.medications.findTreatment(f.user.id, f.dependent.id, row.id)).medication.name,
  ).toBe('Nome corrigido');
  const audit = JSON.stringify(f.foundation.auditRows);
  expect(audit).not.toContain('Produto fictício');
  expect(audit).not.toContain('1 gota por kg');
  expect(audit).not.toContain('Nome corrigido');
});
test('status informado: suspender/retomar/concluir; conclusão é terminal e correção mantém completedAt', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id),
  );
  expect(
    (
      await f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {
        status: 'SUSPENDED',
      })
    ).status,
  ).toBe('SUSPENDED');
  await f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {
    status: 'ACTIVE',
    notes: null,
  });
  const completed = await f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {
    status: 'COMPLETED',
    endDate: '2026-01-15',
  });
  expect(completed.completedAt).toBeInstanceOf(Date);
  expect(
    (
      await f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {
        instructions: 'Correção registrada',
      })
    ).completedAt,
  ).toEqual(completed.completedAt);
  await expect(
    f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, { status: 'ACTIVE' }),
  ).rejects.toThrow('não pode ser reaberto');
  await expect(
    f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, { endDate: null }),
  ).rejects.toThrow('conclusão exige');
});
test('retry transacional não muta campos auditados nem persiste conclusão parcial', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id),
  );
  const run = f.foundation.run.bind(f.foundation);
  jest.spyOn(f.foundation, 'run').mockImplementation(async (operation) => {
    try {
      return await run(operation);
    } catch (error) {
      if (!(error instanceof RepositoryRetryableError)) throw error;
      return run(operation);
    }
  });
  jest
    .spyOn(f.foundation.auditLogs, 'append')
    .mockRejectedValueOnce(new RepositoryRetryableError());
  const completed = await f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {
    status: 'COMPLETED',
    endDate: '2026-01-03',
  });
  expect(completed.completedAt).toBeInstanceOf(Date);
  expect(
    f.foundation.auditRows.filter((event) => event.action === 'MEDICATION_TREATMENT_UPDATED'),
  ).toEqual([expect.objectContaining({ metadata: { changedFields: ['status', 'endDate'] } })]);
});
test.each([
  { startDate: '2026-02-30' },
  { startDate: '9999-01-01' },
  { startDate: '2026-01-02', endDate: '2026-01-01' },
  { status: 'COMPLETED' as const },
  { status: 'COMPLETED' as const, endDate: '9999-01-01' },
])('recusa período incoerente %j sem persistir tratamento/audit', async (override) => {
  const f = await medicationFixture();
  await expect(
    f.medications.createTreatment(f.user.id, f.dependent.id, treatmentDto(f.product.id, override)),
  ).rejects.toThrow();
  expect(f.foundation.medications.treatments.size).toBe(0);
  expect(f.foundation.auditRows).toHaveLength(1);
});
test('planejamento de fim não conclui automaticamente, nem uso contínuo calcula fim/dose', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id, { endDate: '2026-01-02', continuousUse: true }),
  );
  expect(row.status).toBe('ACTIVE');
  const timeline = f.service([f.source]);
  const page = await timeline.list(f.user.id, f.dependent.id, timelineQuery());
  expect(page.items.map((event) => event.type)).toEqual(['MEDICATION_STARTED']);
  expect(JSON.stringify(page)).not.toContain(row.dosage);
});
test.each(['EDITOR', 'VIEWER'] as const)(
  'papel %s aplica menor privilégio nas duas entidades',
  async (role) => {
    const f = await medicationFixture();
    const row = await f.medications.createTreatment(
      f.user.id,
      f.dependent.id,
      treatmentDto(f.product.id),
    );
    const access = [...f.foundation.accessRows.values()][0]!;
    f.foundation.accessRows.set(access.id, { ...access, role });
    await f.medications.findProduct(f.user.id, f.dependent.id, f.product.id);
    await f.medications.findTreatment(f.user.id, f.dependent.id, row.id);
    if (role === 'EDITOR') {
      await f.medications.updateProduct(f.user.id, f.dependent.id, f.product.id, {
        name: 'Correção',
      });
      await f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {
        notes: 'Informado',
      });
    } else {
      await expect(
        f.medications.createProduct(f.user.id, f.dependent.id, { name: 'Negado' }),
      ).rejects.toThrow('Dependente não encontrado.');
      await expect(
        f.medications.updateProduct(f.user.id, f.dependent.id, f.product.id, { name: 'Negado' }),
      ).rejects.toThrow('Dependente não encontrado.');
      await expect(
        f.medications.createTreatment(f.user.id, f.dependent.id, treatmentDto(f.product.id)),
      ).rejects.toThrow('Dependente não encontrado.');
      await expect(
        f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, { notes: 'Negado' }),
      ).rejects.toThrow('Dependente não encontrado.');
    }
    await expect(f.medications.deleteTreatment(f.user.id, f.dependent.id, row.id)).rejects.toThrow(
      'Dependente não encontrado.',
    );
    await expect(
      f.medications.deleteProduct(f.user.id, f.dependent.id, f.product.id),
    ).rejects.toThrow('Dependente não encontrado.');
  },
);
test('nega IDOR de produto/tratamento inclusive entre dois dependentes acessíveis ao mesmo usuário', async () => {
  const f = await medicationFixture();
  const b = await f.foundation.dependents.create({
    fullName: 'Outro',
    preferredName: null,
    birthDate: new Date('2020-01-01'),
    createdByUserId: f.user.id,
  });
  await f.foundation.dependentAccess.create({
    userId: f.user.id,
    dependentId: b.id,
    role: 'OWNER',
    relationship: null,
  });
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id),
  );
  await expect(
    f.medications.createTreatment(f.user.id, b.id, treatmentDto(f.product.id)),
  ).rejects.toThrow('Medicamento não encontrado.');
  await expect(f.medications.findProduct(f.user.id, b.id, f.product.id)).rejects.toThrow(
    'Medicamento não encontrado.',
  );
  await expect(
    f.medications.updateProduct(f.user.id, b.id, f.product.id, { name: 'Negado' }),
  ).rejects.toThrow('Medicamento não encontrado.');
  await expect(f.medications.deleteProduct(f.user.id, b.id, f.product.id)).rejects.toThrow(
    'Medicamento não encontrado.',
  );
  await expect(f.medications.findTreatment(f.user.id, b.id, row.id)).rejects.toThrow(
    'Tratamento não encontrado.',
  );
  await expect(
    f.medications.updateTreatment(f.user.id, b.id, row.id, { notes: 'Negado' }),
  ).rejects.toThrow('Tratamento não encontrado.');
  await expect(f.medications.deleteTreatment(f.user.id, b.id, row.id)).rejects.toThrow(
    'Tratamento não encontrado.',
  );
  await expect(f.medications.findProduct(f.user.id, f.dependent.id, randomUUID())).rejects.toThrow(
    'Medicamento não encontrado.',
  );
  await expect(
    f.medications.findTreatment(f.user.id, f.dependent.id, randomUUID()),
  ).rejects.toThrow('Tratamento não encontrado.');
});
test('produto não pode ocultar tratamentos; exclusão lógica remove timeline e preserva rows', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id),
  );
  await expect(
    f.medications.deleteProduct(f.user.id, f.dependent.id, f.product.id),
  ).rejects.toThrow('tratamentos não excluídos');
  await f.medications.deleteTreatment(f.user.id, f.dependent.id, row.id);
  await expect(f.medications.findTreatment(f.user.id, f.dependent.id, row.id)).rejects.toThrow(
    'Tratamento não encontrado.',
  );
  expect(
    (await f.service([f.source]).list(f.user.id, f.dependent.id, timelineQuery())).items,
  ).toEqual([]);
  await f.medications.deleteProduct(f.user.id, f.dependent.id, f.product.id);
  expect(
    await f.medications.listProducts(f.user.id, f.dependent.id, { limit: 50, offset: 0 }),
  ).toEqual([]);
  expect(f.foundation.medications.products.size).toBe(1);
  expect(f.foundation.medications.treatments.size).toBe(1);
});
test('audit indisponível faz rollback de criação, edição e exclusão nas duas entidades', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id),
  );
  jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValue(new Error('audit unavailable'));
  await expect(
    f.medications.createProduct(f.user.id, f.dependent.id, { name: 'Rollback' }),
  ).rejects.toThrow();
  await expect(
    f.medications.createTreatment(f.user.id, f.dependent.id, treatmentDto(f.product.id)),
  ).rejects.toThrow();
  await expect(
    f.medications.updateProduct(f.user.id, f.dependent.id, f.product.id, { name: 'Rollback' }),
  ).rejects.toThrow();
  await expect(
    f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {
      status: 'COMPLETED',
      endDate: '2026-01-03',
    }),
  ).rejects.toThrow();
  await expect(f.medications.deleteTreatment(f.user.id, f.dependent.id, row.id)).rejects.toThrow();
  expect(f.foundation.medications.products.size).toBe(1);
  expect(f.foundation.medications.treatments.get(row.id)).toMatchObject({
    status: 'ACTIVE',
    deletedAt: null,
    completedAt: null,
  });
  expect(f.foundation.medications.products.get(f.product.id)?.name).toBe('Produto fictício');
  const empty = await f.foundation.medications.createProduct(f.dependent.id, 'Produto vazio');
  await expect(f.medications.deleteProduct(f.user.id, f.dependent.id, empty.id)).rejects.toThrow();
  expect(f.foundation.medications.products.get(empty.id)?.deletedAt).toBeNull();
});
test('não aceita update vazio e não permite redirecionar identidade via propriedade extra no service', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id),
  );
  await expect(
    f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, {}),
  ).rejects.toThrow('ao menos um campo');
  const change = {
    notes: 'Informado',
    medicationId: randomUUID(),
    dependentId: randomUUID(),
    deletedAt: new Date(),
  };
  expect(
    await f.medications.updateTreatment(f.user.id, f.dependent.id, row.id, change),
  ).toMatchObject({ medicationId: f.product.id, dependentId: f.dependent.id, deletedAt: null });
});
test('revogação, conta fechada e dependente excluído impedem acesso sem consultar clinical source', async () => {
  const f = await medicationFixture();
  const access = [...f.foundation.accessRows.values()][0]!;
  f.foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
  await expect(
    f.medications.listTreatments(f.user.id, f.dependent.id, { limit: 50, offset: 0 }),
  ).rejects.toThrow('Dependente não encontrado.');
  f.foundation.accessRows.set(access.id, access);
  f.users.rows.set(f.user.email, { ...f.user, deletedAt: new Date() });
  await expect(
    f.medications.listProducts(f.user.id, f.dependent.id, { limit: 50, offset: 0 }),
  ).rejects.toThrow();
  f.users.rows.set(f.user.email, f.user);
  await f.foundation.dependents.softDeleteForUser(f.dependent.id, f.user.id);
  await expect(
    f.medications.createProduct(f.user.id, f.dependent.id, { name: 'Negado' }),
  ).rejects.toThrow();
});
