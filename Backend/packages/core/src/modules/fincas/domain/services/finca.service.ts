/**
 * Servicio de dominio puro del módulo fincas.
 */
import { DomainError, Result } from "@duitamacrece/shared-kernel";
import type { Finca } from "../entities/finca.entity.ts";
import { FincaDuplicadoError } from "../errors/finca.errors.ts";

export function verificarNombreFincaDisponible(existente: Finca | null): Result<void, DomainError> {
  if (existente) return Result.err(new FincaDuplicadoError(existente.nombre));
  return Result.ok(undefined);
}
