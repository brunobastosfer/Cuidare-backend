export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  status: 'ACTIVE' | 'BLOCKED';
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  credentialVersion: number;
}

export type CreateUser = Pick<User, 'name' | 'email' | 'passwordHash'>;
