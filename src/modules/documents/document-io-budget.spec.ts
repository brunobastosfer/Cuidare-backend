import { ConfigService } from '@nestjs/config';
import { DocumentIoBudget } from './document-io-budget';
test('limita operações sem fila e libera uma única vez', () => {
  const budget = new DocumentIoBudget(new ConfigService({ DOCUMENT_IO_CONCURRENCY: 1 }));
  const release = budget.acquire();
  expect(() => budget.acquire()).toThrow();
  release();
  release();
  const second = budget.acquire();
  expect(() => budget.acquire()).toThrow();
  second();
  expect(() => budget.acquire()).not.toThrow();
});
