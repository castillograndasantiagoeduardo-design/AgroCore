/**
 * Puertos que usa el caso de uso de rotaciones.
 * Solo lectura: no necesita IAuditor ni IUnitOfWork (no muta estado).
 */
import type { PerfilClimaticoDto, PerfilClimaticoParams } from "@duitamacrece/contracts";
import type { DomainError, Result } from "@duitamacrece/shared-kernel";
import type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";

export type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";
export type { IFincaRepository } from "../../../fincas/domain/repositories/finca.repository.ts";
export type { ICultivoRepository } from "../../../cultivos/domain/repositories/cultivo.repository.ts";

/**
 * Consulta del perfil climático calibrado de una finca.
 * ObtenerPerfilClimaticoUseCase (módulo clima) ya cumple esta forma, así que en createContainer
 * se inyecta directamente; en los tests se reemplaza por un perfil fijo.
 */
export interface IPerfilClimaticoQuery {
  execute(input: PerfilClimaticoParams, contexto: ContextoSolicitud): Promise<Result<PerfilClimaticoDto, DomainError>>;
}
