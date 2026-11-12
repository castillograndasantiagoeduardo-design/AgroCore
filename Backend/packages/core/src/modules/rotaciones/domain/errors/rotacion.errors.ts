/**
 * Errores de dominio del módulo rotaciones (extienden DomainError, nunca se lanzan). Todos HTTP 422.
 */
import { DomainError } from "@duitamacrece/shared-kernel";

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
