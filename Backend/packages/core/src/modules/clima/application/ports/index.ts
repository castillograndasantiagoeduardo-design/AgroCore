/**
 * Puertos técnicos que usan los casos de uso de clima (Regla 2: core no sabe de fetch ni de Date.now).
 */
import type { DomainError, Result } from "@agrocore/shared-kernel";
import type { SerieClimatica } from "../../domain/value-objects/registro-clima-diario.vo.ts";
import type { NormalClimatologica } from "../../domain/value-objects/normal-climatologica.vo.ts";

export type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";

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

/** Un mes de la climatología de NASA POWER (promedios de largo plazo). */
export interface MesClimatologia {
  mes: number;
  tempMediaC: number;
  tempMinC: number;
  tempMaxC: number;
  /** Lluvia TOTAL del mes (mm): POWER entrega mm/día y el adaptador multiplica por los días del mes. */
  lluviaMm: number;
  /** Días de helada del mes (POWER FROST_DAYS: días con T2M_MIN < 0 °C); null si el servicio no lo entrega. */
  diasHelada: number | null;
}

export interface ClimatologiaMensual {
  fuente: string;
  /** Periodo que promedia el servicio, p. ej. "2001-2020". */
  periodo: string;
  altitudCeldaM: number;
  meses: MesClimatologia[];
}

/**
 * Climatología mensual de largo plazo (NASA POWER /api/temporal/climatology/point): una sola petición rápida.
 * Sirve para la etapa rápida en frío; el perfil completo usa la serie diaria (IClimaProvider).
 */
export interface IClimatologiaProvider {
  obtenerClimatologia(latitud: number, longitud: number): Promise<Result<ClimatologiaMensual, DomainError>>;
}
