/**
 * Implementación de IMcpToolLogger sobre logs_mcp_tools.
 */
import { type EjecucionMcpTool, type IMcpToolLogger, sanitizarDetalles } from "@duitamacrece/core";
import type { Database } from "../connection.ts";
import { logsMcpToolsTable } from "../schema/index.ts";
import { dbActual } from "../unit-of-work.ts";

export class MySqlMcpToolLogger implements IMcpToolLogger {
  constructor(private readonly db: Database) {}

  async registrar(ejecucion: EjecucionMcpTool): Promise<void> {
    await dbActual(this.db).insert(logsMcpToolsTable).values({
      herramienta: ejecucion.herramienta,
      usuarioId: ejecucion.usuarioId,
      argumentos: sanitizarDetalles(ejecucion.argumentos),
      exito: ejecucion.exito,
      error: ejecucion.error,
      duracionMs: ejecucion.duracionMs,
    });
  }
}
