/**
 * Errores de dominio del módulo terreno (extienden DomainError, nunca se lanzan).
 */
import { DomainError } from "@agrocore/shared-kernel";

/**
 * Un proveedor externo del análisis de terreno (Overpass, ORNL MODIS, SoilGrids, OpenTopoData, NASA POWER)
 * no respondió o respondió mal. El caso de uso lo convierte en advertencia: NUNCA llega como error HTTP.
 */
export class TerrenoProveedorNoDisponibleError extends DomainError {
  constructor(fuente: string, detalle: string) {
    super("TERRENO_PROVEEDOR_NO_DISPONIBLE", fuente + " no está disponible en este momento (" + detalle + ").");
  }
}
