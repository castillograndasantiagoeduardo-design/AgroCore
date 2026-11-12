/**
 * Puerto IMcpToolLogger: registra cada ejecución de herramienta MCP (logs_mcp_tools).
 */

export interface EjecucionMcpTool {
  herramienta: string;
  usuarioId: number;
  argumentos: unknown;
  exito: boolean;
  error: string | null;
  duracionMs: number;
}

export interface IMcpToolLogger {
  registrar(ejecucion: EjecucionMcpTool): Promise<void>;
}
