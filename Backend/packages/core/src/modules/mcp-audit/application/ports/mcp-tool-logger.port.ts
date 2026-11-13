/**
 * Puerto IMcpToolLogger: registra cada ejecución de herramienta MCP (logs_mcp_tools).
 */
import type { OrigenSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";

export interface EjecucionMcpTool {
  herramienta: string;
  origen: OrigenSolicitud;
  argumentos: unknown;
  exito: boolean;
  error: string | null;
  duracionMs: number;
}

export interface IMcpToolLogger {
  registrar(ejecucion: EjecucionMcpTool): Promise<void>;
}
