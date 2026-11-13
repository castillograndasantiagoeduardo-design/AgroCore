/**
 * Value Object inmutable: ubicación de una finca en Duitama.
 *
 * Reglas de negocio que protege:
 *  1. Las coordenadas deben caer dentro del área de estudio (rectángulo que envuelve Duitama).
 *  2. La altitud, si se conoce, debe estar entre 2.300 y 4.000 m.
 *  3. La zona altitudinal (valle / ladera / alta) se DERIVA de la altitud; nadie la escribe a mano.
 */
import { DomainError, Result } from "@agrocore/shared-kernel";
import type { ZonaAltitudinal } from "@agrocore/contracts";
import { FincaAltitudInvalidaError, FincaFueraDeAreaError } from "../errors/finca.errors.ts";

/**
 * Rectángulo aproximado que contiene el municipio de Duitama (con margen).
 * Pendiente: reemplazar por el polígono oficial del IGAC para validar con precisión.
 */
export const AREA_ESTUDIO_DUITAMA = {
  latitudMin: 5.70,
  latitudMax: 6.15,
  longitudMin: -73.25,
  longitudMax: -72.85,
} as const;

export const ALTITUD_MIN_M = 2300;
export const ALTITUD_MAX_M = 4000;

/** Límites de las zonas de trabajo (metros). Valle < 2600 ≤ Ladera < 3000 ≤ Alta. */
export const LIMITE_VALLE_LADERA_M = 2600;
export const LIMITE_LADERA_ALTA_M = 3000;

export function zonaPorAltitud(altitudM: number): ZonaAltitudinal {
  if (altitudM < LIMITE_VALLE_LADERA_M) return "valle";
  if (altitudM < LIMITE_LADERA_ALTA_M) return "ladera";
  return "alta";
}

export class UbicacionFinca {
  private constructor(
    public readonly latitud: number,
    public readonly longitud: number,
    public readonly altitudM: number | null,
  ) {
    Object.freeze(this);
  }

  static crear(datos: { latitud: number; longitud: number; altitudM?: number | null }): Result<UbicacionFinca, DomainError> {
    const a = AREA_ESTUDIO_DUITAMA;
    const dentro = datos.latitud >= a.latitudMin && datos.latitud <= a.latitudMax &&
      datos.longitud >= a.longitudMin && datos.longitud <= a.longitudMax;
    if (!dentro) return Result.err(new FincaFueraDeAreaError(datos.latitud, datos.longitud));

    const altitud = datos.altitudM ?? null;
    if (altitud !== null && (altitud < ALTITUD_MIN_M || altitud > ALTITUD_MAX_M)) {
      return Result.err(new FincaAltitudInvalidaError(altitud));
    }
    return Result.ok(new UbicacionFinca(datos.latitud, datos.longitud, altitud));
  }

  /** Solo para datos ya validados que vienen de persistencia. */
  static reconstruir(latitud: number, longitud: number, altitudM: number | null): UbicacionFinca {
    return new UbicacionFinca(latitud, longitud, altitudM);
  }

  /** null mientras no se conozca la altitud (se completará con SRTM). */
  get zona(): ZonaAltitudinal | null {
    return this.altitudM === null ? null : zonaPorAltitud(this.altitudM);
  }
}
