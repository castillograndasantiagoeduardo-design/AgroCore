/**
 * Puerto IAuditor (Regla 6): todo caso de uso que cree, actualice, anule o
 * cambie el estado de una entidad lo inyecta y registra la operación.
 *
 * sin login ni control de acceso: la auditoría registra el ORIGEN de la solicitud (api, mcp o script) y la IP.
 */

export const ORIGENES_SOLICITUD = ["api", "mcp", "script"] as const;
export type OrigenSolicitud = (typeof ORIGENES_SOLICITUD)[number];

/** Quién hizo la petición, sin identidad de usuario: el canal de entrada y la IP (si se conoce). */
export interface ContextoSolicitud {
  origen: OrigenSolicitud;
  ip: string | null;
}

export interface DetallesAuditoria {
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

export interface EventoAuditoria {
  accion: string;
  entidad: string;
  entidadId: string | number;
  detalles: DetallesAuditoria;
  contexto: ContextoSolicitud;
}

export interface IAuditor {
  registrar(evento: EventoAuditoria): Promise<void>;
}
