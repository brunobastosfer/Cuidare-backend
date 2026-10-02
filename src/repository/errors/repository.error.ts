export class RepositoryConflictError extends Error {
  override readonly name = 'RepositoryConflictError';
  constructor() {
    super('Conflito de registro.');
  }
}

export class RepositoryUnavailableError extends Error {
  override readonly name = 'RepositoryUnavailableError';
  constructor() {
    super('Persistência indisponível.');
  }
}

// Exclusivamente disputas de criação de buckets; não equivale a email duplicado.
export class RepositoryRetryableError extends Error {}
