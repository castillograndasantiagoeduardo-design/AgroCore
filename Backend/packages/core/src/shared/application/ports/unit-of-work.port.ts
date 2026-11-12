/**
 * Puerto IUnitOfWork: ejecuta un trabajo dentro de una transacción
 * (BEGIN / COMMIT / ROLLBACK) en operaciones compuestas.
 */

export interface IUnitOfWork {
  ejecutar<T>(trabajo: () => Promise<T>): Promise<T>;
}
