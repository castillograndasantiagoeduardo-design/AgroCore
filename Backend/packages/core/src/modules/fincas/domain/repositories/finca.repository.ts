/**
 * Puerto de persistencia de Finca. Lo implementa MySqlFincaRepository en @duitamacrece/database.
 */
import type { Paginated, PaginationParams } from "@duitamacrece/shared-kernel";
import type { Finca } from "../entities/finca.entity.ts";

export interface IFincaRepository {
  buscarPorId(id: number): Promise<Finca | null>;
  buscarPorNombre(nombre: string): Promise<Finca | null>;
  listar(paginacion: PaginationParams): Promise<Paginated<Finca>>;
  guardar(entidad: Finca): Promise<Finca>;
}
