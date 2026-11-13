/**
 * Value Object inmutable: nombre de finca.
 */
import { DomainError, Result } from "@agrocore/shared-kernel";
import { FincaNombreInvalidoError } from "../errors/finca.errors.ts";

export class NombreFinca {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  static crear(valor: string): Result<NombreFinca, DomainError> {
    const limpio = valor.trim();
    if (limpio.length < 2 || limpio.length > 120) return Result.err(new FincaNombreInvalidoError());
    return Result.ok(new NombreFinca(limpio));
  }

  /** Solo para datos ya validados que vienen de persistencia. */
  static reconstruir(valor: string): NombreFinca {
    return new NombreFinca(valor);
  }

  equals(otro: NombreFinca): boolean {
    return this.value.toLowerCase() === otro.value.toLowerCase();
  }
}
