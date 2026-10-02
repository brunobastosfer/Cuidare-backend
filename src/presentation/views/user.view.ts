import type { User } from '../../domain/models/user.model';

// Projeção explícita: nunca retorna passwordHash.
export function userView(user: User) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}
