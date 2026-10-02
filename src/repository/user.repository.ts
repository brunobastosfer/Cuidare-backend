import type { CreateUser, User } from '../domain/models/user.model';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUser): Promise<User>;
  verifyEmail(id: string, credentialVersion: number, now: Date): Promise<boolean>;
  resetPassword(id: string, credentialVersion: number, passwordHash: string): Promise<boolean>;
  closeAccount(id: string, credentialVersion: number, now: Date): Promise<boolean>;
}
