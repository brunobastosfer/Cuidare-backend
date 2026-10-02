export type RetentionCategory =
  | 'ACCOUNT'
  | 'DEPENDENT'
  | 'CARE_TASK'
  | 'CONSENT'
  | 'AUDIT'
  | 'AUTH'
  | 'ABUSE'
  | 'PRIVACY'
  | 'MEDICATION'
  | 'APPOINTMENT'
  | 'DOCUMENT'
  | 'VACCINATION'
  | 'EDUCATION';
export type RetentionDays = Record<RetentionCategory, number | null>;
