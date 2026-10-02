import './setup-env';

const target = process.env.TEST_DATABASE_URL;
if (!target)
  throw new Error('Informe TEST_DATABASE_URL para um banco exclusivo chamado cuidare_test.');
const url = new URL(target);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/cuidare_test') {
  throw new Error('Os testes de integração só aceitam um banco PostgreSQL chamado cuidare_test.');
}
process.env.DATABASE_URL = target;
