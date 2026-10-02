import { PasswordService } from './password.service';
import { ServiceUnavailableException } from '@nestjs/common';

test('usa Argon2id com salt e verifica senhas sem guardar texto puro', async () => {
  const service = new PasswordService();
  await service.onModuleInit();
  const password = 'Uma senha longa para teste!';
  const hash = await service.hash(password);
  expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,(?:t=3,p=1|p=1,t=3)\$/);
  expect(hash).not.toContain(password);
  expect(await service.verify(password, hash)).toBe(true);
  expect(await service.verify('senha incorreta', hash)).toBe(false);
  expect(await service.verify(password, undefined)).toBe(false);
});

test('limita a dois hashes concorrentes e libera os slots após conclusão', async () => {
  const service = new PasswordService();
  const first = service.hash('Primeira senha longa para teste!');
  const second = service.hash('Segunda senha longa para teste!');
  await expect(service.hash('Terceira senha longa para teste!')).rejects.toBeInstanceOf(
    ServiceUnavailableException,
  );
  await Promise.all([first, second]);
  expect(await service.hash('Novo trabalho após a conclusão!')).toMatch(/^\$argon2id/);
});
