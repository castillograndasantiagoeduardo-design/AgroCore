/**
 * Errores de dominio del módulo fincas (extienden DomainError, nunca se lanzan).
 */
import { DomainError } from "@agrocore/shared-kernel";

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

/** Coordenadas fuera de rango (latitud −90..90, longitud −180..180). HTTP 422. */
export class FincaCoordenadasInvalidasError extends DomainError {
  constructor(latitud: number, longitud: number) {
    super(
      "FINCA_COORDENADAS_INVALIDAS",
      "Las coordenadas (" + latitud + ", " + longitud + ") no son válidas: latitud −90..90 y longitud −180..180.",
    );
  }
}

/** Altitud imposible para un cultivo (rango aceptado: −500 a 6.000 m). HTTP 422. */
export class FincaAltitudInvalidaError extends DomainError {
  constructor(altitudM: number) {
    super("FINCA_ALTITUD_INVALIDA", "La altitud " + altitudM + " m no es válida (rango aceptado: −500 a 6.000 m).");
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
