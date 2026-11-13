/**
 * Caso de uso: ficha completa de un cultivo por su clave (solo lectura, no audita).
 */
import type { ObtenerCultivoParams } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import type { CultivoSnapshot } from "../../domain/entities/cultivo.entity.ts";
import type { ICultivoRepository } from "../../domain/repositories/cultivo.repository.ts";
import { CultivoNoEncontradoError } from "../../domain/errors/cultivo.errors.ts";
import type { ContextoSolicitud } from "../ports/index.ts";

export class ObtenerCultivoUseCase {
  constructor(private readonly repositorio: ICultivoRepository) {}

  async execute(input: ObtenerCultivoParams, _contexto: ContextoSolicitud): Promise<Result<CultivoSnapshot, DomainError>> {
    const cultivo = await this.repositorio.buscarPorClave(input.clave);
    if (!cultivo) return Result.err(new CultivoNoEncontradoError(input.clave));
    return Result.ok(cultivo.toSnapshot());
  }
}
