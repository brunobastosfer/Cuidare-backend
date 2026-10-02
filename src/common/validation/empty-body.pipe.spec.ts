import { EmptyBodyPipe } from './empty-body.pipe';
test.each([{}, undefined])('aceita corpo vazio %j', (value) => {
  expect(new EmptyBodyPipe().transform(value)).toBeUndefined();
});
test.each([null, [], 'string', { userId: 'foreign' }])('recusa corpo inválido %j', (value) => {
  expect(() => new EmptyBodyPipe().transform(value)).toThrow();
});
