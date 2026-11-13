/**
 * Puertos del módulo impresion.
 */
import type { ComparacionRotacionesDto, CompararRotacionesUbicacionInput, LineaTicketDto } from "@agrocore/contracts";
import type { DomainError, Result } from "@agrocore/shared-kernel";
import type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";

export type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";
export type { IReloj } from "../../../clima/application/ports/index.ts";
export type { IAnalisisTerrenoQuery } from "../../../rotaciones/application/ports/index.ts";

/** Comparación de rotaciones de cualquier ubicación (la cumple CompararRotacionesUbicacionUseCase). */
export interface IComparacionRotacionesQuery {
  execute(input: CompararRotacionesUbicacionInput, contexto: ContextoSolicitud): Promise<Result<ComparacionRotacionesDto, DomainError>>;
}

/**
 * Impresora térmica (ESC/POS). Implementación: EscPosWindowsPrinter (platform), que convierte las líneas a bytes
 * ESC/POS en la página de códigos configurada y las envía en crudo a la impresora compartida de Windows.
 * Si la impresora no está compartida, apagada o sin papel → Result.err(ImpresoraNoDisponibleError), nunca throw.
 */
export interface IImpresoraTermica {
  imprimir(lineas: readonly LineaTicketDto[]): Promise<Result<{ impresora: string }, DomainError>>;
}
