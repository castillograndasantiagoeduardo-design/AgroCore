/**
 * Implementación de IUnitOfWork: BEGIN / COMMIT / ROLLBACK reales sobre MySQL.
 * Los repositorios usan dbActual(this.db) para participar en la transacción en curso.
 * Si el trabajo lanza un fallo técnico se hace ROLLBACK (Regla 3).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { IUnitOfWork } from "@agrocore/core";
import type { Database } from "./connection.ts";

const transaccionActual = new AsyncLocalStorage<Database>();

export function dbActual(db: Database): Database {
  return transaccionActual.getStore() ?? db;
}

export class MySqlUnitOfWork implements IUnitOfWork {
  constructor(private readonly db: Database) {}

  async ejecutar<T>(trabajo: () => Promise<T>): Promise<T> {
    return await this.db.transaction((tx) => transaccionActual.run(tx as unknown as Database, trabajo));
  }
}
