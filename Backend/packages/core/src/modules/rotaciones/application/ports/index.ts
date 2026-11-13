/**
 * Puertos que usan los casos de uso de rotaciones.
 * Solo lectura: no necesitan IAuditor ni IUnitOfWork (no mutan estado).
 */
import type { PerfilClimaticoDto, PerfilTerrenoDto } from "@agrocore/contracts";
import type { DomainError, Result } from "@agrocore/shared-kernel";
import type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";
import type { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";

export type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";
export type { ICultivoRepository } from "../../../cultivos/domain/repositories/cultivo.repository.ts";

/**
 * Perfil climático de cualquier ubicación. ObtenerPerfilClimaticoUseCase (módulo clima) cumple esta forma,
 * así que en createContainer se inyecta directamente; en los tests se reemplaza por un perfil fijo.
 */
export interface IPerfilClimaticoQuery {
  porUbicacion(
    ubicacion: { latitud: number; longitud: number; altitudM: number | null },
    contexto: ContextoSolicitud,
  ): Promise<Result<PerfilClimaticoDto, DomainError>>;
}

/**
 * Análisis del terreno de un área ya validada. AnalizarTerrenoUseCase (módulo terreno) cumple esta forma.
 * Nunca falla: si un proveedor externo cae, el perfil sale con advertencias.
 */
export interface IAnalisisTerrenoQuery {
  analizar(area: AreaSeleccionada): Promise<PerfilTerrenoDto>;
}
