/**
 * MySqlElevacionRegion: implementa IElevacionProvider con la grilla regional de 0,01° (elevacion_region).
 * Devuelve la elevación del punto de grilla más cercano: es APROXIMADA (hasta ~0,5 km de error horizontal).
 * `cubre(puntos)` dice si las filas de la grilla de esos puntos están "listo".
 */
import { type ElevacionPuntos, type IElevacionProvider, type LatLon, TerrenoProveedorNoDisponibleError } from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { sql } from "drizzle-orm";
import type { Database } from "../connection.ts";
import { dbActual } from "../unit-of-work.ts";
import { indiceElevacion, TIPO_BLOQUE } from "../precalculo/bloques.ts";

export const FUENTE_ELEVACION_REGION = "SRTM 30 m vía OpenTopoData (grilla regional 0,01°, aproximada)";

type Fila = Record<string, unknown>;

export class MySqlElevacionRegion implements IElevacionProvider {
  constructor(private readonly db: Database) {}

  async cubre(puntos: readonly LatLon[]): Promise<boolean> {
    if (puntos.length === 0) return false;
    try {
      const filas = [...new Set(puntos.map((p) => indiceElevacion(p[0])))];
      const [r] = await dbActual(this.db).execute(sql`
        SELECT COUNT(*) AS n FROM precalculo_bloques
        WHERE tipo = ${TIPO_BLOQUE.elevacion} AND estado = 'listo'
          AND clave IN (${sql.join(filas.map((i) => sql`${String(i)}`), sql`, `)})`);
      return Number((r as unknown as Fila[])[0]?.n) === filas.length;
    } catch {
      return false;
    }
  }

  async obtenerElevaciones(puntos: readonly LatLon[]): Promise<Result<ElevacionPuntos, DomainError>> {
    try {
      const celdas = puntos.map((p) => [indiceElevacion(p[0]), indiceElevacion(p[1])] as const);
      const unicas = [...new Map(celdas.map((c) => [c[0] + ":" + c[1], c])).values()];
      const valores = new Map<string, number>();
      if (unicas.length > 0) {
        const [filas] = await dbActual(this.db).execute(sql`
          SELECT i, j, elevacion_m FROM elevacion_region
          WHERE (i, j) IN (${sql.join(unicas.map((c) => sql`(${c[0]}, ${c[1]})`), sql`, `)})`);
        for (const f of filas as unknown as Fila[]) valores.set(f.i + ":" + f.j, Number(f.elevacion_m));
      }
      return Result.ok({
        fuente: FUENTE_ELEVACION_REGION,
        elevacionesM: celdas.map((c) => valores.get(c[0] + ":" + c[1]) ?? null),
      });
    } catch (error) {
      return Result.err(
        new TerrenoProveedorNoDisponibleError("SRTM (grilla regional)", error instanceof Error ? error.message.slice(0, 120) : "error de MySQL"),
      );
    }
  }
}
