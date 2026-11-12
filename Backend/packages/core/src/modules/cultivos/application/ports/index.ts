/**
 * Puertos técnicos que usan los casos de uso de cultivos.
 * Hoy solo lectura: no necesita IAuditor ni IUnitOfWork (no muta estado).
 */
export type { ContextoActor } from "../../../auditoria/application/ports/auditor.port.ts";
