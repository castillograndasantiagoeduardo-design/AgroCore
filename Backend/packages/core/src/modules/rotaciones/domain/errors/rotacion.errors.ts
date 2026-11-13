/**
 * Errores de dominio del módulo rotaciones (extienden DomainError, nunca se lanzan). Todos HTTP 422.
 */
import { DomainError } from "@agrocore/shared-kernel";

/** No se puede armar la estrategia A: la finca no tiene cultivoActual y no se envió secuenciaActual. */
export class RotacionCultivoActualRequeridoError extends DomainError {
  constructor(fincaId: number) {
    super(
      "ROTACION_CULTIVO_ACTUAL_REQUERIDO",
      "La finca " + fincaId + " no tiene cultivo actual registrado. Envía 'secuenciaActual' con lo que siembra hoy " +
        "(claves del catálogo, ej. [\"papa\"]) para poder comparar.",
    );
  }
}

/** Una clave de secuenciaActual (o el cultivoActual guardado) no está en el catálogo. */
export class RotacionCultivoDesconocidoError extends DomainError {
  constructor(clave: string) {
    super("ROTACION_CULTIVO_DESCONOCIDO", "El cultivo '" + clave + "' no está en el catálogo de cultivos.");
  }
}

/** Ninguna secuencia de 4 semestres cumple las reglas para esta finca (altitud, heladas, agua). */
export class RotacionSinAlternativasError extends DomainError {
  constructor(motivo: string) {
    super(
      "ROTACION_SIN_ALTERNATIVAS",
      "No se encontró ninguna rotación alternativa que cumpla las reglas para esta finca (" + motivo + "). " +
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
      "El clima del sitio no tiene ninguna temporada de cultivo (temperatura media < 5 °C o helada dura casi todo el año), ni siquiera con riego.",
    );
  }
}
