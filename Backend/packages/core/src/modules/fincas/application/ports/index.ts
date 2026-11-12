/**
 * Puertos técnicos que usan los casos de uso de fincas.
 * Si el módulo necesita correo, tokens, hora o IA, define aquí su interfaz (Regla 2).
 */
export type { ContextoActor, IAuditor } from "../../../auditoria/application/ports/auditor.port.ts";
export type { IUnitOfWork } from "../../../../shared/application/ports/unit-of-work.port.ts";
