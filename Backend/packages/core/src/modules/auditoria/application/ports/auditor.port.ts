/**
 * Puerto IAuditor (Regla 6): todo caso de uso que cree, actualice, anule o
 * cambie el estado de una entidad lo inyecta y registra la operación.
 */

export interface ContextoActor {
  usuarioId: number;
  rol: string;
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
  contexto: ContextoActor;
}

export interface IAuditor {
  registrar(evento: EventoAuditoria): Promise<void>;
}
