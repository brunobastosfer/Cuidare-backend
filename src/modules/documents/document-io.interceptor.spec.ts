import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, Subject, throwError } from 'rxjs';
import { DocumentIoBudget } from './document-io-budget';
import { DocumentIoInterceptor } from './document-io.interceptor';
function fixture() {
  const budget = new DocumentIoBudget(new ConfigService({ DOCUMENT_IO_CONCURRENCY: 1 }));
  const response = Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
  const context = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { budget, response, context, interceptor: new DocumentIoInterceptor(budget) };
}
test('slot permanece reservado após controller até entregar/fechar resposta; listeners removidos', async () => {
  const f = fixture();
  expect(
    await lastValueFrom(f.interceptor.intercept(f.context, { handle: () => of('fixture') })),
  ).toBe('fixture');
  expect(() => f.budget.acquire()).toThrow();
  f.response.emit('finish');
  expect(f.response.listenerCount('finish') + f.response.listenerCount('close')).toBe(0);
  f.response.emit('close');
  const release = f.budget.acquire();
  expect(() => f.budget.acquire()).toThrow();
  release();
});
test('cliente abortado não libera scan ainda pendente', async () => {
  const f = fixture(),
    pending = new Subject<string>();
  const done = lastValueFrom(f.interceptor.intercept(f.context, { handle: () => pending }));
  f.response.destroyed = true;
  f.response.emit('close');
  expect(() => f.budget.acquire()).toThrow();
  pending.next('done');
  pending.complete();
  await done;
  expect(() => f.budget.acquire()).not.toThrow();
});
test('erro de processamento libera slot só após resposta final e não deixa listener', async () => {
  const f = fixture();
  await expect(
    lastValueFrom(
      f.interceptor.intercept(f.context, { handle: () => throwError(() => new Error('fixture')) }),
    ),
  ).rejects.toThrow('fixture');
  expect(() => f.budget.acquire()).toThrow();
  f.response.emit('finish');
  expect(() => f.budget.acquire()).not.toThrow();
  expect(f.response.listenerCount('finish') + f.response.listenerCount('close')).toBe(0);
});
test('throw síncrono do handler segue liberação e resposta já fechada não fica retida', async () => {
  const f = fixture();
  f.response.destroyed = true;
  await expect(
    lastValueFrom(
      f.interceptor.intercept(f.context, {
        handle: () => {
          throw new Error('fixture');
        },
      }),
    ),
  ).rejects.toThrow('fixture');
  expect(() => f.budget.acquire()).not.toThrow();
});
