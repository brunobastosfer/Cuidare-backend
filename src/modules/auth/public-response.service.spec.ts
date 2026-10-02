import { ConfigService } from '@nestjs/config';
import { PublicResponseService } from './public-response.service';
test('piso temporal também se aplica a falhas e preserva o erro original', async () => {
  const service = new PublicResponseService(new ConfigService({ AUTH_RESPONSE_MIN_MS: 20 }));
  const start = performance.now();
  await expect(service.run(() => Promise.reject(new Error('failure')))).rejects.toThrow('failure');
  expect(performance.now() - start).toBeGreaterThanOrEqual(15);
});
