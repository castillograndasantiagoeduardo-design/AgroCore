/**
 * Caso de uso: listar fincas paginados (solo lectura, no audita).
 */
import type { ListarFincasQuery } from "@duitamacrece/contracts";
import { DomainError, type Paginated, Result } from "@duitamacrece/shared-kernel";
import type { FincaSnapshot } from "../../domain/entities/finca.entity.ts";
import type { IFincaRepository } from "../../domain/repositories/finca.repository.ts";
import type { ContextoActor } from "../ports/index.ts";

export class ListarFincasUseCase {
  constructor(private readonly repositorio: IFincaRepository) {}

  async execute(input: ListarFincasQuery, _contexto: ContextoActor): Promise<Result<Paginated<FincaSnapshot>, DomainError>> {
    const pagina = await this.repositorio.listar({ page: input.page, pageSize: input.pageSize });
    return Result.ok({ ...pagina, items: pagina.items.map((e) => e.toSnapshot()) });
  }
}
