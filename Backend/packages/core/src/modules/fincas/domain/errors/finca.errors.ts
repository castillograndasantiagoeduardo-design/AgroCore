/**
 * Errores de dominio del módulo fincas (extienden DomainError, nunca se lanzan).
 */
import { DomainError } from "@duitamacrece/shared-kernel";

export class FincaNoEncontradoError extends DomainError {
  constructor(id: number | null) {
    super("FINCA_NO_ENCONTRADO", "No existe finca con id " + id + ".");
  }
}

export class FincaDuplicadoError extends DomainError {
  constructor(nombre: string) {
    super("FINCA_DUPLICADO", "Ya existe finca con el nombre '" + nombre + "'.");
  }
}

export class FincaNombreInvalidoError extends DomainError {
  constructor() {
    super("FINCA_NOMBRE_INVALIDO", "El nombre de finca debe tener entre 2 y 120 caracteres.");
  }
}

/** La finca está fuera del área de estudio (municipio de Duitama). HTTP 422. */
export class FincaFueraDeAreaError extends DomainError {
  constructor(latitud: number, longitud: number) {
    super(
      "FINCA_FUERA_DE_AREA",
      "Las coordenadas (" + latitud + ", " + longitud + ") están fuera del área de estudio de Duitama.",
    );
  }
}

/** Altitud imposible para Duitama (el municipio va aprox. de 2.300 a 4.000 m). HTTP 422. */
export class FincaAltitudInvalidaError extends DomainError {
  constructor(altitudM: number) {
    super("FINCA_ALTITUD_INVALIDA", "La altitud " + altitudM + " m no es válida para Duitama (2300–4000 m).");
  }
}

export class FincaYaInactivoError extends DomainError {
  constructor(id: number | null) {
    super("FINCA_YA_INACTIVO", "El finca " + id + " ya está inactivo.");
  }
}

/** El cultivo actual no es una clave del catálogo de cultivos. HTTP 422. */
export class FincaCultivoDesconocidoError extends DomainError {
  constructor(clave: string) {
    super(
      "FINCA_CULTIVO_DESCONOCIDO",
      "El cultivo actual '" + clave + "' no está en el catálogo de cultivos. Consulta las claves válidas en GET /api/cultivos.",
    );
  }
}
