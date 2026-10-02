import { registerDecorator } from 'class-validator';
import { isCivilDate } from './civil-date';
export function isUtcInstant(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) ||
    !isCivilDate(value.slice(0, 10))
  )
    return false;
  const [hour, minute, second] = value.slice(11, 19).split(':').map(Number);
  return hour! < 24 && minute! < 60 && second! < 60 && Number.isFinite(Date.parse(value));
}
export function IsUtcInstant(): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isUtcInstant',
      target: target.constructor,
      propertyName: String(propertyKey),
      validator: {
        validate: isUtcInstant,
        defaultMessage: () => 'Data deve ser timestamp UTC válido com Z.',
      },
    });
}
