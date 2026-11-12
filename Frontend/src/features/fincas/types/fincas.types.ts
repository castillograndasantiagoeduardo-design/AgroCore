/**
 * Tipos de vista del módulo fincas.
 */
import type { FincaDto } from "@duitamacrece/contracts";

export interface PaginaFincas {
  items: FincaDto[];
  total: number;
  page: number;
  pageSize: number;
}
