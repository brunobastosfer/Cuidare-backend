import { randomUUID } from 'node:crypto';
import {
  appointmentFixture,
  appointmentDto,
  recommendationDto,
} from '../../../test/helpers/appointment-fixture';
import { timelineQuery } from '../../../test/helpers/timeline-fixture';
import { appointmentView, recommendationView } from '../../presentation/views/appointment.view';
import type { DependentAccessRole } from '../../domain/models/dependent.model';
import { RepositoryRetryableError } from '../../repository/errors/repository.error';
import type { TransactionRepositories } from '../../repository/unit-of-work.repository';
test('fluxo: consulta UTC, recomendação civil, atualizações explícitas e campos técnicos fora de views', async () => {
  const f = await appointmentFixture();
  expect(f.appointment.date.toISOString()).toBe('2026-01-01T14:30:00.123Z');
  expect(f.appointment.followUpDate).toBeNull();
  const rec = await f.appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    recommendationDto(),
  );
  expect(rec.status).toBe('PENDING');
  expect(rec.completedAt).toBeNull();
  await f.appointments.update(f.user.id, f.dependent.id, f.appointment.id, {
    notes: 'Texto privado',
  });
  const edited = await f.appointments.updateRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    rec.id,
    { status: 'IN_PROGRESS', endDate: '2026-01-15' },
  );
  expect(edited.endDate?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  const withExtra = { ...edited, token: 'private', deletedAt: new Date() };
  expect(recommendationView(withExtra)).not.toHaveProperty('token');
  expect(recommendationView(withExtra)).not.toHaveProperty('completedAt');
  expect(appointmentView({ ...f.appointment })).not.toHaveProperty('deletedAt');
  expect(JSON.stringify(f.foundation.auditRows)).not.toContain('Texto privado');
  expect(JSON.stringify(f.foundation.auditRows)).not.toContain(rec.description);
});
test.each(['OWNER', 'EDITOR', 'VIEWER'] as DependentAccessRole[])(
  'papel %s: acesso mínimo nos dois recursos',
  async (role) => {
    const f = await appointmentFixture();
    const other = await f.users.create({
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
    const rec = await f.appointments.createRecommendation(
      f.user.id,
      f.dependent.id,
      f.appointment.id,
      recommendationDto(),
    );
    expect((await f.appointments.find(other.id, f.dependent.id, f.appointment.id)).id).toBe(
      f.appointment.id,
    );
    expect(
      (await f.appointments.findRecommendation(other.id, f.dependent.id, f.appointment.id, rec.id))
        .id,
    ).toBe(rec.id);
    const update = () =>
      f.appointments.update(other.id, f.dependent.id, f.appointment.id, { notes: 'Correção' });
    const updateRec = () =>
      f.appointments.updateRecommendation(other.id, f.dependent.id, f.appointment.id, rec.id, {
        status: 'IN_PROGRESS',
      });
    if (role === 'VIEWER') {
      await expect(update()).rejects.toThrow();
      await expect(updateRec()).rejects.toThrow();
      await expect(
        f.appointments.create(other.id, f.dependent.id, appointmentDto()),
      ).rejects.toThrow();
      await expect(
        f.appointments.createRecommendation(
          other.id,
          f.dependent.id,
          f.appointment.id,
          recommendationDto(),
        ),
      ).rejects.toThrow();
    } else {
      await update();
      await updateRec();
    }
    if (role !== 'OWNER') {
      await expect(
        f.appointments.deleteRecommendation(other.id, f.dependent.id, f.appointment.id, rec.id),
      ).rejects.toThrow();
      await expect(
        f.appointments.delete(other.id, f.dependent.id, f.appointment.id),
      ).rejects.toThrow();
    } else {
      await f.appointments.deleteRecommendation(other.id, f.dependent.id, f.appointment.id, rec.id);
      await f.appointments.delete(other.id, f.dependent.id, f.appointment.id);
    }
  },
);
test('usuário estranho, recurso inexistente e ID de consulta não pertencente são indistinguíveis', async () => {
  const f = await appointmentFixture();
  const other = await f.users.create({
    name: 'Fixture',
    email: 'stranger@example.com',
    passwordHash: 'fixture',
  });
  await expect(f.appointments.find(other.id, f.dependent.id, f.appointment.id)).rejects.toThrow(
    'Dependente não encontrado.',
  );
  await expect(f.appointments.find(other.id, randomUUID(), randomUUID())).rejects.toThrow(
    'Dependente não encontrado.',
  );
  const second = await f.appointments.create(f.user.id, f.dependent.id, appointmentDto());
  const rec = await f.appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    recommendationDto(),
  );
  await expect(
    f.appointments.findRecommendation(f.user.id, f.dependent.id, second.id, rec.id),
  ).rejects.toThrow('Recomendação não encontrada.');
  await expect(
    f.appointments.updateRecommendation(f.user.id, f.dependent.id, second.id, rec.id, {
      title: 'Negado',
    }),
  ).rejects.toThrow();
  await expect(
    f.appointments.deleteRecommendation(f.user.id, f.dependent.id, second.id, rec.id),
  ).rejects.toThrow();
});
test('exclusão lógica não oculta filhos silenciosamente; pais excluídos somem das leituras e timeline', async () => {
  const f = await appointmentFixture();
  const rec = await f.appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    recommendationDto(),
  );
  await expect(
    f.appointments.delete(f.user.id, f.dependent.id, f.appointment.id),
  ).rejects.toMatchObject({ status: 409 });
  await f.appointments.deleteRecommendation(f.user.id, f.dependent.id, f.appointment.id, rec.id);
  await expect(
    f.appointments.findRecommendation(f.user.id, f.dependent.id, f.appointment.id, rec.id),
  ).rejects.toThrow();
  await f.appointments.delete(f.user.id, f.dependent.id, f.appointment.id);
  await expect(
    f.appointments.createRecommendation(
      f.user.id,
      f.dependent.id,
      f.appointment.id,
      recommendationDto(),
    ),
  ).rejects.toThrow();
  expect(
    (await f.service(f.sources).list(f.user.id, f.dependent.id, timelineQuery())).items,
  ).toEqual([]);
  expect(f.foundation.appointments.rows.get(f.appointment.id)?.deletedAt).toBeInstanceOf(Date);
  expect(f.foundation.appointments.recommendations.get(rec.id)?.deletedAt).toBeInstanceOf(Date);
});
test.each(['COMPLETED', 'CANCELLED'] as const)(
  'estado terminal %s não reabre, mas permite corrigir texto',
  async (status) => {
    const f = await appointmentFixture();
    const rec = await f.appointments.createRecommendation(
      f.user.id,
      f.dependent.id,
      f.appointment.id,
      recommendationDto(),
    );
    const done = await f.appointments.updateRecommendation(
      f.user.id,
      f.dependent.id,
      f.appointment.id,
      rec.id,
      { status },
    );
    expect(Boolean(done.completedAt)).toBe(status === 'COMPLETED');
    await expect(
      f.appointments.updateRecommendation(f.user.id, f.dependent.id, f.appointment.id, rec.id, {
        status: 'PENDING',
      }),
    ).rejects.toMatchObject({ status: 409 });
    const corrected = await f.appointments.updateRecommendation(
      f.user.id,
      f.dependent.id,
      f.appointment.id,
      rec.id,
      { description: 'Texto corrigido' },
    );
    expect(corrected.completedAt).toEqual(done.completedAt);
  },
);
test('datas previstas não alteram estado nem geram conclusão; futuro não confirma atendimento', async () => {
  const f = await appointmentFixture();
  const row = await f.appointments.create(
    f.user.id,
    f.dependent.id,
    appointmentDto({ date: '2099-01-01T00:00:00Z' }),
  );
  const rec = await f.appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    row.id,
    recommendationDto({ startDate: '2025-01-01', endDate: '2025-01-02' }),
  );
  expect(rec.status).toBe('PENDING');
  const page = await f.service(f.sources).list(f.user.id, f.dependent.id, timelineQuery());
  expect(page.items.some((e) => e.sourceId === row.id && e.title === 'Consulta registrada')).toBe(
    true,
  );
  expect(page.items.some((e) => e.type === 'MEDICAL_RECOMMENDATION_COMPLETED')).toBe(false);
});
test('períodos, PATCH parcial combinado e vazio são validados sem gravar/auditar', async () => {
  const f = await appointmentFixture();
  const before = f.foundation.auditRows.length;
  await expect(
    f.appointments.create(
      f.user.id,
      f.dependent.id,
      appointmentDto({ followUpDate: '2025-01-01T00:00:00Z' }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    f.appointments.update(f.user.id, f.dependent.id, f.appointment.id, {}),
  ).rejects.toMatchObject({ status: 400 });
  const rec = await f.appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    recommendationDto({ endDate: '2026-01-02' }),
  );
  await expect(
    f.appointments.updateRecommendation(f.user.id, f.dependent.id, f.appointment.id, rec.id, {}),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    f.appointments.updateRecommendation(f.user.id, f.dependent.id, f.appointment.id, rec.id, {
      startDate: '2026-01-03',
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    f.appointments.createRecommendation(
      f.user.id,
      f.dependent.id,
      f.appointment.id,
      recommendationDto({ startDate: '2026-02-30' }),
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(f.foundation.auditRows.length).toBe(before + 1);
});
test('audit falha: criação, atualização e exclusão revertem junto com dados', async () => {
  const f = await appointmentFixture();
  const rec = await f.appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    recommendationDto(),
  );
  jest.spyOn(f.foundation.auditLogs, 'append').mockRejectedValue(new Error('audit failed'));
  await expect(f.appointments.create(f.user.id, f.dependent.id, appointmentDto())).rejects.toThrow(
    'audit failed',
  );
  await expect(
    f.appointments.createRecommendation(
      f.user.id,
      f.dependent.id,
      f.appointment.id,
      recommendationDto(),
    ),
  ).rejects.toThrow('audit failed');
  await expect(
    f.appointments.update(f.user.id, f.dependent.id, f.appointment.id, { notes: 'No commit' }),
  ).rejects.toThrow('audit failed');
  await expect(
    f.appointments.updateRecommendation(f.user.id, f.dependent.id, f.appointment.id, rec.id, {
      status: 'COMPLETED',
    }),
  ).rejects.toThrow('audit failed');
  await expect(
    f.appointments.deleteRecommendation(f.user.id, f.dependent.id, f.appointment.id, rec.id),
  ).rejects.toThrow('audit failed');
  expect(f.foundation.appointments.rows.size).toBe(1);
  expect(f.foundation.appointments.rows.get(f.appointment.id)?.notes).toBeNull();
  expect(f.foundation.appointments.recommendations.get(rec.id)).toMatchObject({
    status: 'PENDING',
    completedAt: null,
    deletedAt: null,
  });
});
test('retry transacional não adiciona completedAt aos campos auditados', async () => {
  const f = await appointmentFixture();
  const rec = await f.appointments.createRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    recommendationDto(),
  );
  const run = f.foundation.run.bind(f.foundation);
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
  const done = await f.appointments.updateRecommendation(
    f.user.id,
    f.dependent.id,
    f.appointment.id,
    rec.id,
    { status: 'COMPLETED' },
  );
  expect(done.completedAt).toBeInstanceOf(Date);
  expect(f.foundation.auditRows.at(-1)?.metadata.changedFields).toEqual(['status']);
});
test.each(['revoked', 'blocked', 'deleted-dependent'] as const)(
  '%s retira leitura, escrita e timeline',
  async (state) => {
    const f = await appointmentFixture();
    if (state === 'revoked') {
      const access = [...f.foundation.accessRows.values()][0]!;
      f.foundation.accessRows.set(access.id, { ...access, revokedAt: new Date() });
    } else if (state === 'blocked') {
      f.users.rows.set(f.user.email, { ...f.user, status: 'BLOCKED' });
    } else await f.foundation.dependents.softDeleteForUser(f.dependent.id, f.user.id);
    await expect(
      f.appointments.find(f.user.id, f.dependent.id, f.appointment.id),
    ).rejects.toThrow();
    await expect(
      f.appointments.create(f.user.id, f.dependent.id, appointmentDto()),
    ).rejects.toThrow();
    await expect(
      f.service(f.sources).list(f.user.id, f.dependent.id, timelineQuery()),
    ).rejects.toThrow();
  },
);
