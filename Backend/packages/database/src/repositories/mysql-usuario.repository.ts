/**
 * MySqlUsuarioRepository: implementa IUsuarioRepository con Drizzle.
 */
import { eq } from "drizzle-orm";
import type { IUsuarioRepository, Usuario } from "@duitamacrece/core";
import type { Database } from "../connection.ts";
import { dbActual } from "../unit-of-work.ts";
import { usuariosTable } from "../schema/usuarios.schema.ts";
import { UsuarioMapper } from "../mappers/usuario.mapper.ts";

export class MySqlUsuarioRepository implements IUsuarioRepository {
  constructor(private readonly db: Database) {}

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const [row] = await dbActual(this.db)
      .select()
      .from(usuariosTable)
      .where(eq(usuariosTable.email, email))
      .limit(1);
    return row ? UsuarioMapper.toDomain(row) : null;
  }

  async buscarPorId(id: number): Promise<Usuario | null> {
    const [row] = await dbActual(this.db)
      .select()
      .from(usuariosTable)
      .where(eq(usuariosTable.id, id))
      .limit(1);
    return row ? UsuarioMapper.toDomain(row) : null;
  }

  async guardar(entidad: Usuario): Promise<Usuario> {
    const db = dbActual(this.db);
    const datos = UsuarioMapper.toPersistence(entidad);
    let id = entidad.id;
    if (id === null) {
      const [insertado] = await db.insert(usuariosTable).values(datos).$returningId();
      id = insertado.id;
    } else {
      await db.update(usuariosTable).set(datos).where(eq(usuariosTable.id, id));
    }
    const guardado = await this.buscarPorId(id);
    if (!guardado) throw new Error("[DB] No se pudo leer usuario " + id + " tras guardarlo");
    return guardado;
  }
}

