/**
 * Catálogo de acciones de auditoría (logs_auditoria).
 */

export const AUDIT_ACTIONS = {
  // @scaffold:audit-actions
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
