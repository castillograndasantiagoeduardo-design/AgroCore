/**
 * MySqlPrecalculo: escritura y avance del precálculo regional (lo usa scripts/precalcular-region.ts).
 * Los repositorios de lectura (MySqlViasRegion, etc.) están en sus propios archivos.
 *
 * Reanudable: precalculo_bloques guarda el estado de cada bloque (pendiente | listo | error). Las inserciones son
 * INSERT IGNORE por osm_id (los bloques vecinos repiten las vías que los cruzan) o REPLACE por clave primaria,
 * así que repetir un bloque nunca duplica datos.
 */
import type { LatLon, SerieClimatica } from "@agrocore/core";
import { sql } from "drizzle-orm";
import type { Database } from "../connection.ts";
import { dbActual } from "../unit-of-work.ts";
import { comprimirJson } from "../precalculo/gzip.ts";
import { wktLinea, wktPoligono } from "../precalculo/geo-sql.ts";
import type { TipoBloque } from "../precalculo/bloques.ts";

export type EstadoBloque = "pendiente" | "listo" | "error";

export interface ViaParaGuardar {
  osmId: number;
  tipo: string;
  nombre: string | null;
  geometria: readonly LatLon[];
}
export interface AnilloParaGuardar {
  osmId: number;
  geometria: readonly LatLon[];
}
export interface AguaParaGuardar {
  osmId: number;
  /** "poligono" | "river" | "canal". */
  tipo: string;
  geometria: readonly LatLon[];
}
export interface CeldaGuardada {
  celdaI: number;
  celdaJ: number;
  versionMotor: string | null;
  tieneRecomendacion: boolean;
  desde: string;
  hasta: string;
}

type Fila = Record<string, unknown>;

const LOTE = 400;

export class MySqlPrecalculo {
  constructor(private readonly db: Database) {}

  // ---------- Avance ----------

  /** Estado e intentos de todos los bloques de un tipo. */
  async estadoBloques(tipo: TipoBloque): Promise<Map<string, { estado: EstadoBloque; intentos: number }>> {
    const [filas] = await dbActual(this.db).execute(sql`SELECT clave, estado, intentos FROM precalculo_bloques WHERE tipo = ${tipo}`);
    return new Map((filas as unknown as Fila[]).map((f) => [String(f.clave), { estado: f.estado as EstadoBloque, intentos: Number(f.intentos) }]));
  }

  async marcarBloque(tipo: TipoBloque, clave: string, estado: EstadoBloque, detalle: string | null = null): Promise<void> {
    const texto = detalle ? detalle.slice(0, 300) : null;
    await dbActual(this.db).execute(sql`
      INSERT INTO precalculo_bloques (tipo, clave, estado, intentos, detalle) VALUES (${tipo}, ${clave}, ${estado}, ${estado === "pendiente" ? 0 : 1}, ${texto})
      ON DUPLICATE KEY UPDATE estado = VALUES(estado), detalle = VALUES(detalle),
        intentos = IF(VALUES(estado) = 'pendiente', intentos, intentos + 1)`);
  }

  /** Resumen por tipo: cuántos bloques hay en cada estado. */
  async resumen(): Promise<{ tipo: string; estado: string; n: number }[]> {
    const [filas] = await dbActual(this.db).execute(sql`
      SELECT tipo, estado, COUNT(*) AS n FROM precalculo_bloques GROUP BY tipo, estado ORDER BY tipo, estado`);
    return (filas as unknown as Fila[]).map((f) => ({ tipo: String(f.tipo), estado: String(f.estado), n: Number(f.n) }));
  }

  // ---------- Vías, edificaciones y agua ----------

  /** Inserta por lotes; si un lote falla (geometría inválida) lo reintenta fila por fila y omite las malas. */
  private async insertarGeometrias<T>(
    tabla: string,
    columnas: string,
    items: readonly T[],
    valores: (item: T) => unknown[] | null,
  ): Promise<{ insertadas: number; omitidas: number }> {
    let insertadas = 0;
    let omitidas = 0;
    const db = dbActual(this.db);
    const fila = (v: unknown[]) => sql`(${sql.join(v.map((x, i) => i === v.length - 1 ? sql`ST_GeomFromText(${x}, 4326, 'axis-order=long-lat')` : sql`${x}`), sql`, `)})`;
    const preparadas = items.map(valores).filter((v): v is unknown[] => v !== null);
    omitidas += items.length - preparadas.length;
    for (let i = 0; i < preparadas.length; i += LOTE) {
      const lote = preparadas.slice(i, i + LOTE);
      try {
        const [r] = await db.execute(sql`INSERT IGNORE INTO ${sql.raw(tabla)} (${sql.raw(columnas)}) VALUES ${sql.join(lote.map(fila), sql`, `)}`);
        insertadas += Number((r as unknown as { affectedRows?: number }).affectedRows ?? 0);
      } catch {
        for (const v of lote) {
          try {
            const [r] = await db.execute(sql`INSERT IGNORE INTO ${sql.raw(tabla)} (${sql.raw(columnas)}) VALUES ${fila(v)}`);
            insertadas += Number((r as unknown as { affectedRows?: number }).affectedRows ?? 0);
          } catch {
            omitidas++;
          }
        }
      }
    }
    return { insertadas, omitidas };
  }

  insertarVias(vias: readonly ViaParaGuardar[]) {
    return this.insertarGeometrias("vias_region", "osm_id, tipo, nombre, geom", vias, (v) => {
      const wkt = wktLinea(v.geometria);
      return wkt ? [v.osmId, v.tipo.slice(0, 40), v.nombre?.slice(0, 200) ?? null, wkt] : null;
    });
  }

  insertarEdificaciones(items: readonly AnilloParaGuardar[]) {
    return this.insertarGeometrias("edificaciones_region", "osm_id, geom", items, (v) => {
      const wkt = wktPoligono(v.geometria);
      return wkt ? [v.osmId, wkt] : null;
    });
  }

  insertarAgua(items: readonly AguaParaGuardar[]) {
    return this.insertarGeometrias("agua_region", "osm_id, tipo, geom", items, (v) => {
      const wkt = v.tipo === "poligono" ? wktPoligono(v.geometria) : wktLinea(v.geometria);
      return wkt ? [v.osmId, v.tipo, wkt] : null;
    });
  }

  // ---------- Cobertura ----------

  async guardarCobertura(b: {
    clave: string;
    xll: number;
    yll: number;
    cellsize: number;
    nrows: number;
    ncols: number;
    anio: number;
    fuente: string;
    datos: Uint8Array;
  }): Promise<void> {
    await dbActual(this.db).execute(sql`
      REPLACE INTO cobertura_region (clave, xll, yll, cellsize, nrows, ncols, anio, fuente, datos)
      VALUES (${b.clave}, ${b.xll}, ${b.yll}, ${b.cellsize}, ${b.nrows}, ${b.ncols}, ${b.anio}, ${b.fuente}, ${b.datos})`);
  }

  // ---------- Elevación ----------

  async guardarElevaciones(filas: readonly { i: number; j: number; elevacionM: number }[]): Promise<void> {
    const db = dbActual(this.db);
    for (let k = 0; k < filas.length; k += 1000) {
      const lote = filas.slice(k, k + 1000);
      await db.execute(sql`
        REPLACE INTO elevacion_region (i, j, elevacion_m) VALUES ${sql.join(lote.map((f) => sql`(${f.i}, ${f.j}, ${Math.round(f.elevacionM)})`), sql`, `)}`);
    }
  }

  // ---------- Clima ----------

  async guardarCelda(c: {
    celdaI: number;
    celdaJ: number;
    latitud: number;
    longitud: number;
    serie: SerieClimatica;
    desde: string;
    hasta: string;
  }): Promise<number> {
    const bytes = await comprimirJson(c.serie);
    // REPLACE borra la recomendación anterior: se recalcula en la fase de detalle.
    await dbActual(this.db).execute(sql`
      REPLACE INTO precalculo_celdas (celda_i, celda_j, latitud, longitud, altitud_celda_m, serie_diaria, desde, hasta, fuente)
      VALUES (${c.celdaI}, ${c.celdaJ}, ${c.latitud}, ${c.longitud}, ${c.serie.altitudCeldaM}, ${bytes}, ${c.desde}, ${c.hasta}, ${c.serie.fuente.slice(0, 120)})`);
    return bytes.length;
  }

  async guardarRecomendacionCelda(celdaI: number, celdaJ: number, recomendacion: unknown, versionMotor: string): Promise<void> {
    await dbActual(this.db).execute(sql`
      UPDATE precalculo_celdas SET recomendacion = ${JSON.stringify(recomendacion)}, version_motor = ${versionMotor}
      WHERE celda_i = ${celdaI} AND celda_j = ${celdaJ}`);
  }

  async listarCeldas(): Promise<CeldaGuardada[]> {
    const [filas] = await dbActual(this.db).execute(sql`
      SELECT celda_i, celda_j, version_motor, recomendacion IS NOT NULL AS tiene,
             DATE_FORMAT(desde, '%Y-%m-%d') AS desde, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta
      FROM precalculo_celdas`);
    return (filas as unknown as Fila[]).map((f) => ({
      celdaI: Number(f.celda_i),
      celdaJ: Number(f.celda_j),
      versionMotor: f.version_motor === null ? null : String(f.version_motor),
      tieneRecomendacion: Number(f.tiene) === 1,
      desde: String(f.desde),
      hasta: String(f.hasta),
    }));
  }

  async altitudCelda(celdaI: number, celdaJ: number): Promise<number | null> {
    const [filas] = await dbActual(this.db).execute(sql`SELECT altitud_celda_m FROM precalculo_celdas WHERE celda_i = ${celdaI} AND celda_j = ${celdaJ}`);
    const f = (filas as unknown as Fila[])[0];
    return f ? Number(f.altitud_celda_m) : null;
  }

  /** Conteos para el resumen final. */
  async conteos(): Promise<Record<string, number>> {
    const tablas = ["precalculo_celdas", "vias_region", "edificaciones_region", "agua_region", "cobertura_region", "elevacion_region"];
    const salida: Record<string, number> = {};
    for (const t of tablas) {
      const [filas] = await dbActual(this.db).execute(sql`SELECT COUNT(*) AS n FROM ${sql.raw(t)}`);
      salida[t] = Number((filas as unknown as Fila[])[0]?.n);
    }
    return salida;
  }
}
