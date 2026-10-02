export type DependentAccessRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type DependentRelationship = 'PARENT' | 'LEGAL_GUARDIAN' | 'OTHER';

export interface Dependent {
  id: string;
  fullName: string;
  preferredName: string | null;
  birthDate: Date;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type CreateDependent = Pick<
  Dependent,
  'fullName' | 'preferredName' | 'birthDate' | 'createdByUserId'
>;
export type UpdateDependent = Partial<Pick<Dependent, 'fullName' | 'preferredName' | 'birthDate'>>;

export interface UserDependentAccess {
  id: string;
  userId: string;
  dependentId: string;
  role: DependentAccessRole;
  relationship: DependentRelationship | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export type CreateDependentAccess = Pick<
  UserDependentAccess,
  'userId' | 'dependentId' | 'role' | 'relationship'
>;
