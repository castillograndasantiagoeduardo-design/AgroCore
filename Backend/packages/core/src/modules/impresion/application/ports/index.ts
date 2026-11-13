/**
 * Puertos del módulo impresion.
 */
import type { LineaTicketDto, RecomendacionInput, RecomendacionRapidaDto } from "@agrocore/contracts";
import type { DomainError, Result } from "@agrocore/shared-kernel";
import type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";

export type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";
export type { IReloj } from "../../../clima/application/ports/index.ts";

/** Etapa rápida de la recomendación (la cumple RecomendarPorEpocaUseCase). */
export interface IRecomendacionRapidaQuery {
  execute(input: RecomendacionInput, contexto: ContextoSolicitud): Promise<Result<RecomendacionRapidaDto, DomainError>>;
}

/**
 * Impresora térmica (ESC/POS). Implementación: EscPosWindowsPrinter (platform), que convierte las líneas a bytes
 * ESC/POS en la página de códigos configurada y las envía en crudo a la impresora compartida de Windows.
 * Si la impresora no está compartida, apagada o sin papel → Result.err(ImpresoraNoDisponibleError), nunca throw.
 */
export interface IImpresoraTermica {
  imprimir(lineas: readonly LineaTicketDto[]): Promise<Result<{ impresora: string }, DomainError>>;
}
