/**
 * Value Object inmutable: ubicación de una finca en cualquier lugar del mundo.
 *
 * Reglas de negocio que protege:
 *  1. Latitud −90..90 y longitud −180..180 (WGS84).
 *  2. La altitud, si se conoce, está entre −500 m (depresiones como el mar Muerto) y 6.000 m
 *     (por encima no hay agricultura).
 *  La clasificación del clima del sitio (tropical, templado, frío...) NO se guarda aquí:
 *  se deriva del perfil climático en el módulo clima.
 */
import { DomainError, Result } from "@agrocore/shared-kernel";
import { FincaAltitudInvalidaError, FincaCoordenadasInvalidasError } from "../errors/finca.errors.ts";

export const ALTITUD_MIN_M = -500;
export const ALTITUD_MAX_M = 6000;

export class UbicacionFinca {
  private constructor(
    public readonly latitud: number,
    public readonly longitud: number,
    public readonly altitudM: number | null,
  ) {
    Object.freeze(this);
  }

  static crear(datos: { latitud: number; longitud: number; altitudM?: number | null }): Result<UbicacionFinca, DomainError> {
    const { latitud, longitud } = datos;
    if (!Number.isFinite(latitud) || latitud < -90 || latitud > 90 || !Number.isFinite(longitud) || longitud < -180 || longitud > 180) {
      return Result.err(new FincaCoordenadasInvalidasError(latitud, longitud));
    }
    const altitud = datos.altitudM ?? null;
    if (altitud !== null && (!Number.isFinite(altitud) || altitud < ALTITUD_MIN_M || altitud > ALTITUD_MAX_M)) {
      return Result.err(new FincaAltitudInvalidaError(altitud));
    }
    return Result.ok(new UbicacionFinca(latitud, longitud, altitud));
  }

  /** Solo para datos ya validados que vienen de persistencia. */
  static reconstruir(latitud: number, longitud: number, altitudM: number | null): UbicacionFinca {
    return new UbicacionFinca(latitud, longitud, altitudM);
  }
}
