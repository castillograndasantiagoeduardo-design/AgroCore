/**
 * Errores de dominio del módulo cultivos (extienden DomainError, nunca se lanzan).
 */
import { DomainError } from "@duitamacrece/shared-kernel";

/** No hay cultivo con esa clave en el catálogo. HTTP 404 (sufijo _NO_ENCONTRADO). */
export class CultivoNoEncontradoError extends DomainError {
  constructor(clave: string) {
    super("CULTIVO_NO_ENCONTRADO", "No existe un cultivo con la clave '" + clave + "' en el catálogo.");
  }
}

/**
 * Un registro del catálogo es incoherente (ej. altitud óptima fuera del rango posible).
 * Protege al motor de rotaciones de recomendar con datos mal cargados. HTTP 422.
 */
export class CultivoDatosInvalidosError extends DomainError {
  constructor(clave: string, motivo: string) {
    super("CULTIVO_DATOS_INVALIDOS", "Datos inválidos del cultivo '" + clave + "': " + motivo + ".");
  }
}
