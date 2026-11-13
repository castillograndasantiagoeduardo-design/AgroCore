/**
 * Errores de dominio del módulo impresion (extienden DomainError, nunca se lanzan).
 */
import { DomainError } from "@agrocore/shared-kernel";

/**
 * La impresora térmica no está disponible (no compartida en Windows, apagada, sin papel, o el servidor no es
 * Windows). HTTP 503. El Frontend ofrece el respaldo window.print().
 */
export class ImpresoraNoDisponibleError extends DomainError {
  constructor(impresora: string, detalle: string) {
    super(
      "IMPRESORA_NO_DISPONIBLE",
      "La impresora '" + impresora + "' no está disponible (" + detalle + "). Compártela en Windows con ese nombre, enciéndela " +
        "y revisa el papel, o imprime desde el navegador.",
    );
  }
}
