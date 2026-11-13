/**
 * Errores de dominio del módulo clima (extienden DomainError, nunca se lanzan).
 */
import { DomainError } from "@agrocore/shared-kernel";

/** El servicio externo de clima (NASA POWER) no respondió o respondió mal. HTTP 422. */
export class ClimaProveedorNoDisponibleError extends DomainError {
  constructor(fuente: string, detalle: string) {
    super("CLIMA_PROVEEDOR_NO_DISPONIBLE", fuente + " no está disponible en este momento (" + detalle + "). Intenta de nuevo.");
  }
}

/** El proveedor respondió, pero no hay datos suficientes para los 12 meses. HTTP 422. */
export class ClimaSinDatosError extends DomainError {
  constructor(latitud: number, longitud: number) {
    super(
      "CLIMA_SIN_DATOS",
      "No hay datos climáticos suficientes para (" + latitud + ", " + longitud + ") en el periodo consultado.",
    );
  }
}
