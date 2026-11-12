/**
 * Tipos base para consultas paginadas.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function toOffset({ page, pageSize }: PaginationParams): number {
  return (Math.max(page, 1) - 1) * pageSize;
}
