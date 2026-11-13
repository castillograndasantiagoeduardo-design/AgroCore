/**
 * Value Object inmutable: rango numérico cerrado [min, max].
 * Se usa para ciclo (días), altitud (m) y agua (mm) de un cultivo.
 *
 * Reglas que protege: ambos extremos son números finitos, no negativos y min ≤ max.
 */
import { DomainError, Result } from "@agrocore/shared-kernel";
import { CultivoDatosInvalidosError } from "../errors/cultivo.errors.ts";

export class Rango {
  private constructor(
    public readonly min: number,
    public readonly max: number,
  ) {
    Object.freeze(this);
  }

  /** `clave` y `campo` solo sirven para que el mensaje de error diga dónde está el problema. */
  static crear(min: number, max: number, clave: string, campo: string): Result<Rango, DomainError> {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0) {
      return Result.err(new CultivoDatosInvalidosError(clave, campo + " debe tener números ≥ 0"));
    }
    if (min > max) {
      return Result.err(new CultivoDatosInvalidosError(clave, campo + " tiene mínimo (" + min + ") mayor que máximo (" + max + ")"));
    }
    return Result.ok(new Rango(min, max));
  }

  contiene(valor: number): boolean {
    return valor >= this.min && valor <= this.max;
  }

  /** true si `otro` cabe completo dentro de este rango. */
  incluye(otro: Rango): boolean {
    return otro.min >= this.min && otro.max <= this.max;
  }

  toJSON(): { min: number; max: number } {
    return { min: this.min, max: this.max };
  }
}
