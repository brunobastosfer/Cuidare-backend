import { randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException, type OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string | undefined;
  private active = 0;

  async onModuleInit() {
    this.dummyHash = await this.hash(randomBytes(32).toString('hex'));
  }

  hash(password: string): Promise<string> {
    return this.withSlot(() =>
      argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
    );
  }

  async verify(password: string, storedHash: string | undefined): Promise<boolean> {
    const hash = storedHash ?? this.dummyHash;
    if (!hash) throw new Error('PasswordService não foi inicializado.');
    // Usuário inexistente também passa pelo Argon2 para reduzir diferenças de tempo.
    return this.withSlot(() => argon2.verify(hash, password));
  }

  private async withSlot<T>(operation: () => Promise<T>): Promise<T> {
    // No máximo 128MiB em hashes concorrentes por instância, sem fila ilimitada.
    if (this.active >= 2)
      throw new ServiceUnavailableException('Autenticação temporariamente indisponível.');
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }
}
