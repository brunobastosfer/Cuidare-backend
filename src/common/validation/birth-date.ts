import { registerDecorator, type ValidationOptions } from 'class-validator';

export function isBirthDate(value: unknown, today = new Date()): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value <= today.toISOString().slice(0, 10)
  );
}
export function IsBirthDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isBirthDate',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      ...(options ? { options } : {}),
      validator: {
        validate: (value: unknown) => isBirthDate(value),
        defaultMessage: () => 'birthDate deve ser uma data civil válida YYYY-MM-DD, não futura.',
      },
    });
}
