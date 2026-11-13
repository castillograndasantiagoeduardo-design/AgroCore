/**
 * Puerto de lectura del catálogo de cultivos.
 * Hoy lo implementa CatalogoCultivosEnMemoria (@agrocore/database, datos versionados en código);
 * mañana puede implementarlo un MySqlCultivoRepository sin tocar core.
 */
import type { Cultivo } from "../entities/cultivo.entity.ts";

export interface ICultivoRepository {
  /** Todos los cultivos del catálogo, ordenados por nombre. */
  listar(): Promise<Cultivo[]>;
  buscarPorClave(clave: string): Promise<Cultivo | null>;
}
