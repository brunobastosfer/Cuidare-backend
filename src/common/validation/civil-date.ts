import { registerDecorator, type ValidationOptions } from 'class-validator';
export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function IsCivilDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isCivilDate',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      ...(options ? { options } : {}),
      validator: {
        validate: (value: unknown) => isCivilDate(value),
        defaultMessage: () => 'Data deve ser uma data civil válida YYYY-MM-DD.',
      },
    });
}
