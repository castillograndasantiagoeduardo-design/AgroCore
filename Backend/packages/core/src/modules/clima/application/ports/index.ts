/**
 * Puertos técnicos que usan los casos de uso de clima (Regla 2: core no sabe de fetch ni de Date.now).
 */
import type { DomainError, Result } from "@duitamacrece/shared-kernel";
import type { SerieClimatica } from "../../domain/value-objects/registro-clima-diario.vo.ts";
import type { NormalClimatologica } from "../../domain/value-objects/normal-climatologica.vo.ts";

export type { ContextoActor } from "../../../auditoria/application/ports/auditor.port.ts";

/**
 * Fuente de datos climáticos diarios. Implementación actual: NasaPowerClient (platform).
 * Si el servicio externo falla (red, timeout, respuesta inválida) devuelve
 * Result.err(ClimaProveedorNoDisponibleError) en vez de lanzar una excepción.
 */
export interface IClimaProvider {
  obtenerSerieDiaria(consulta: {
    latitud: number;
    longitud: number;
    /** YYYY-MM-DD */
    desde: string;
    /** YYYY-MM-DD */
    hasta: string;
  }): Promise<Result<SerieClimatica, DomainError>>;
}

/**
 * Fuente de normales climatológicas de estaciones en tierra. Implementación: IdeamNormalesClient (platform).
 * Devuelve la estación más cercana que tenga lluvia y temperaturas (mín, media, máx) completas,
 * o null si no hay ninguna. Si el servicio falla devuelve Result.err.
 */
export interface INormalesClimatologicasProvider {
  estacionMasCercana(latitud: number, longitud: number): Promise<
    Result<{ normal: NormalClimatologica; distanciaKm: number } | null, DomainError>
  >;
}

/** Reloj inyectable: permite fijar "hoy" en los tests. */
export interface IReloj {
  hoy(): Date;
}
