// Puertos y servicios transversales
export type { IUnitOfWork } from "./shared/application/ports/unit-of-work.port.ts";
export type { ICacheProveedores } from "./shared/application/ports/cache-proveedores.port.ts";
export {
  ETIQUETAS_TIEMPO,
  type EtiquetaTiempo,
  type IMedidorTiempos,
  MEDIDOR_NULO,
} from "./shared/application/ports/medidor-tiempos.port.ts";
export { conPlazo, type ConPlazo, type ITemporizador } from "./shared/application/ports/temporizador.port.ts";
export {
  type ContextoSolicitud,
  type DetallesAuditoria,
  type EventoAuditoria,
  type IAuditor,
  ORIGENES_SOLICITUD,
  type OrigenSolicitud,
} from "./modules/auditoria/application/ports/auditor.port.ts";
export * from "./shared/domain/geo/geometria.ts";
export * from "./shared/domain/geo/area-seleccionada.vo.ts";
export { sanitizarDetalles } from "./modules/auditoria/domain/services/sanitizar-detalles.ts";
export type { EjecucionMcpTool, IMcpToolLogger } from "./modules/mcp-audit/application/ports/mcp-tool-logger.port.ts";

// Módulos de dominio
export * from "./modules/clima/index.ts";
export * from "./modules/cultivos/index.ts";
export * from "./modules/rotaciones/index.ts";
export * from "./modules/terreno/index.ts";
export * from "./modules/impresion/index.ts";
export * from "./modules/recomendacion/index.ts";
// @scaffold:modules
