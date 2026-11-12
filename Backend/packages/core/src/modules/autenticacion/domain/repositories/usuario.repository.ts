/**
 * Puerto de persistencia para Usuario.
 */
import type { Usuario } from "../entities/usuario.entity.ts";

export interface IUsuarioRepository {
  buscarPorEmail(email: string): Promise<Usuario | null>;
  buscarPorId(id: number): Promise<Usuario | null>;
  guardar(usuario: Usuario): Promise<Usuario>;
}

