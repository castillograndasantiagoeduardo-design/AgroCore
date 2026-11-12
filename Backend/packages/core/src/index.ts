// Puertos y servicios transversales
export type { IUnitOfWork } from "./shared/application/ports/unit-of-work.port.ts";
export type {
  ContextoActor,
  DetallesAuditoria,
  EventoAuditoria,
  IAuditor,
} from "./modules/auditoria/application/ports/auditor.port.ts";
export { sanitizarDetalles } from "./modules/auditoria/domain/services/sanitizar-detalles.ts";
export type { ITokenService, TokenPayload } from "./modules/autenticacion/application/ports/token-service.port.ts";
export type { EjecucionMcpTool, IMcpToolLogger } from "./modules/mcp-audit/application/ports/mcp-tool-logger.port.ts";

// Módulos de dominio
export * from "./modules/autenticacion/index.ts";
export * from "./modules/fincas/index.ts";
export * from "./modules/clima/index.ts";
export * from "./modules/cultivos/index.ts";
export * from "./modules/rotaciones/index.ts";
// @scaffold:modules
