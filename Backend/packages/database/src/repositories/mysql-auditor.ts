/**
 * Implementación de IAuditor sobre logs_auditoria. Sanitiza siempre los detalles.
 */
import { type EventoAuditoria, type IAuditor, sanitizarDetalles } from "@duitamacrece/core";
import type { Database } from "../connection.ts";
import { logsAuditoriaTable } from "../schema/index.ts";
import { dbActual } from "../unit-of-work.ts";

export class MySqlAuditor implements IAuditor {
  constructor(private readonly db: Database) {}

  async registrar(evento: EventoAuditoria): Promise<void> {
    await dbActual(this.db).insert(logsAuditoriaTable).values({
      accion: evento.accion,
      entidad: evento.entidad,
      entidadId: String(evento.entidadId),
      detalles: sanitizarDetalles(evento.detalles),
      usuarioId: evento.contexto.usuarioId,
      ip: evento.contexto.ip,
    });
  }
}
