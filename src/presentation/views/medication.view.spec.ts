import { medicationFixture, treatmentDto } from '../../../test/helpers/medication-fixture';
import { medicationView, medicationTreatmentView } from './medication.view';
test('views explícitas removem internos e serializam datas civis sem timezone', async () => {
  const f = await medicationFixture();
  const row = await f.medications.createTreatment(
    f.user.id,
    f.dependent.id,
    treatmentDto(f.product.id, { status: 'COMPLETED', endDate: '2026-01-03' }),
  );
  const internalProduct = { ...f.product, internal: 'secret' };
  const internalTreatment = { ...row, internal: 'secret' };
  const product = medicationView(internalProduct);
  const result = medicationTreatmentView(internalTreatment);
  expect(Object.keys(product).sort()).toEqual(
    ['id', 'dependentId', 'name', 'createdAt', 'updatedAt'].sort(),
  );
  expect(result.startDate).toBe('2026-01-01');
  expect(result.endDate).toBe('2026-01-03');
  expect(JSON.stringify(result)).not.toContain('internal');
  expect(JSON.stringify(result)).not.toContain('completedAt');
  expect(JSON.stringify(result)).not.toContain('deletedAt');
});
