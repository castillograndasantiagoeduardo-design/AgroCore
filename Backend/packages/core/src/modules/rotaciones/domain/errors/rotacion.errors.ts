/**
 * Errores de dominio del módulo rotaciones (extienden DomainError, nunca se lanzan). Todos HTTP 422.
 */
import { DomainError } from "@agrocore/shared-kernel";
import { TEMP_MINIMA_CRECIMIENTO_C } from "../../../clima/domain/services/temporadas-cultivo.service.ts";

/** Una clave de secuenciaActual (o el cultivoActual) no está en el catálogo. */
export class RotacionCultivoDesconocidoError extends DomainError {
  constructor(clave: string) {
    super("ROTACION_CULTIVO_DESCONOCIDO", "El cultivo '" + clave + "' no está en el catálogo de cultivos.");
  }
}

/** Ninguna secuencia de 4 semestres cumple las reglas para este sitio (altitud, heladas, agua). */
export class RotacionSinAlternativasError extends DomainError {
  constructor(motivo: string) {
    super(
      "ROTACION_SIN_ALTERNATIVAS",
      "No se encontró ninguna rotación alternativa que cumpla las reglas para este sitio (" + motivo + "). " +
        "Consulta con un agrónomo local.",
    );
  }
}

/**
 * El sitio no es apto para sembrar (carretera, edificación, agua o uso del suelo): no se calculan rotaciones.
 * El mensaje es el del módulo terreno, ej. "No se puede sembrar: es carretera". HTTP 422.
 */
export class TerrenoNoAptoError extends DomainError {
  constructor(_aptitud: string, mensaje: string) {
    super("TERRENO_NO_APTO", mensaje);
  }
}

/** Ni con riego hay meses aptos para cultivar (frío o helada todo el año). HTTP 422. */
export class RotacionSinTemporadasError extends DomainError {
  constructor() {
    super(
      "ROTACION_SIN_TEMPORADAS",
      "El clima del sitio no tiene ninguna temporada de cultivo (temperatura media < " + TEMP_MINIMA_CRECIMIENTO_C + " °C o helada dura casi todo el año), ni siquiera con riego.",
    );
  }
}
