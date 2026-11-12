/**
 * SistemaReloj: implementa IReloj con la hora real del sistema.
 * En los tests se reemplaza por un reloj fijo.
 */
import type { IReloj } from "@duitamacrece/core";

export class SistemaReloj implements IReloj {
  hoy(): Date {
    return new Date();
  }
}
