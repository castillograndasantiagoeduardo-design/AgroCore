/**
 * MySqlFincaRepository: implementa IFincaRepository con Drizzle.
 */
import { count, desc, eq } from "drizzle-orm";
import type { Finca, IFincaRepository } from "@agrocore/core";
import { type Paginated, type PaginationParams, toOffset } from "@agrocore/shared-kernel";
import type { Database } from "../connection.ts";
import { dbActual } from "../unit-of-work.ts";
import { fincasTable } from "../schema/fincas.schema.ts";
import { FincaMapper } from "../mappers/finca.mapper.ts";

export class MySqlFincaRepository implements IFincaRepository {
  constructor(private readonly db: Database) {}

  async buscarPorId(id: number): Promise<Finca | null> {
    const [row] = await dbActual(this.db).select().from(fincasTable).where(eq(fincasTable.id, id)).limit(1);
    return row ? FincaMapper.toDomain(row) : null;
  }

  async buscarPorNombre(nombre: string): Promise<Finca | null> {
    const [row] = await dbActual(this.db).select().from(fincasTable).where(eq(fincasTable.nombre, nombre)).limit(1);
    return row ? FincaMapper.toDomain(row) : null;
  }

  async listar(paginacion: PaginationParams): Promise<Paginated<Finca>> {
    const db = dbActual(this.db);
    const rows = await db
      .select()
      .from(fincasTable)
      .orderBy(desc(fincasTable.id))
      .limit(paginacion.pageSize)
      .offset(toOffset(paginacion));
    const [{ total }] = await db.select({ total: count() }).from(fincasTable);
    return { items: rows.map(FincaMapper.toDomain), total, page: paginacion.page, pageSize: paginacion.pageSize };
  }

  async guardar(entidad: Finca): Promise<Finca> {
    const db = dbActual(this.db);
    const datos = FincaMapper.toPersistence(entidad);
    let id = entidad.id;
    if (id === null) {
      const [insertado] = await db.insert(fincasTable).values(datos).$returningId();
      id = insertado.id;
    } else {
      await db.update(fincasTable).set(datos).where(eq(fincasTable.id, id));
    }
    const guardado = await this.buscarPorId(id);
    if (!guardado) throw new Error("[DB] No se pudo leer fincas " + id + " tras guardarlo");
    return guardado;
  }
}
