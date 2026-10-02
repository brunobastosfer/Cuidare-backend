export const FILE_STORAGE_REPOSITORY = Symbol('FILE_STORAGE_REPOSITORY');
export interface FileStorageRepository {
  put(key: string, bytes: Buffer): Promise<void>; // Imutável; nunca sobrescrever.
  get(key: string, maxBytes: number): Promise<Buffer>;
  remove(key: string): Promise<void>; // Compensar somente upload não confirmado.
  // Capacidade opcional de um futuro adaptador cloud; autorização antes de invocar.
  createReadUrl?(key: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: Date }>;
}
