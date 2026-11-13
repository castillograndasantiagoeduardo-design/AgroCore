/**
 * Caso de uso: listar el catálogo de cultivos con filtros opcionales (solo lectura, no audita).
 * Si se envía altitudM, devuelve solo los aptos a esa altitud, primero los óptimos.
 */
import type { ListarCultivosQuery } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import type { CultivoSnapshot } from "../../domain/entities/cultivo.entity.ts";
import type { ICultivoRepository } from "../../domain/repositories/cultivo.repository.ts";
import { filtrarCultivos } from "../../domain/services/filtrar-cultivos.service.ts";
import type { ContextoSolicitud } from "../ports/index.ts";

export class ListarCultivosUseCase {
  constructor(private readonly repositorio: ICultivoRepository) {}

  async execute(input: ListarCultivosQuery, _contexto: ContextoSolicitud): Promise<Result<CultivoSnapshot[], DomainError>> {
    const catalogo = await this.repositorio.listar();
    const filtrados = filtrarCultivos(catalogo, input);
    return Result.ok(filtrados.map((f) => f.cultivo.toSnapshot(f.aptitudAltitud)));
  }
}
