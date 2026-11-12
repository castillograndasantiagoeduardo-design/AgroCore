/**
 * Mapper: traduce filas SQL a la entidad Usuario de core y viceversa.
 */
import { Usuario } from "@duitamacrece/core";
import type { NuevoUsuarioRow, UsuarioRow } from "../schema/usuarios.schema.ts";

export const UsuarioMapper = {
  toDomain(row: UsuarioRow): Usuario {
    return Usuario.reconstruir({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      rol: row.rol,
      activo: row.activo,
      creadoEn: row.creadoEn,
    });
  },

  toPersistence(entidad: Usuario): NuevoUsuarioRow {
    return {
      email: entidad.email,
      passwordHash: entidad.passwordHash,
      rol: entidad.rol,
      activo: entidad.activo,
    };
  },
};

