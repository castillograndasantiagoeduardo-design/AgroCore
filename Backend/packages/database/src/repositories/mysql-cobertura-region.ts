/**
 * MySqlCoberturaRegion: implementa ICoberturaProvider con los bloques MODIS MCD12Q1 de cobertura_region.
 * Convierte lat/lon a la proyección sinusoidal de MODIS y lee el píxel del bloque. Los datos de cada bloque se
 * cargan una vez y quedan en memoria.
 */
import { type CoberturaModis, type ICoberturaProvider, TerrenoProveedorNoDisponibleError } from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { sql } from "drizzle-orm";
import type { Database } from "../connection.ts";
import { dbActual } from "../unit-of-work.ts";
import { aSinusoidal, indicePixel, type RejillaModis } from "../precalculo/sinusoidal.ts";

const VIGENCIA_BLOQUES_MS = 60_000;

interface Bloque extends RejillaModis {
  id: number;
  anio: number;
  fuente: string;
}

type Fila = Record<string, unknown>;

export class MySqlCoberturaRegion implements ICoberturaProvider {
  private bloques: { lista: Bloque[]; hasta: number } | null = null;
  private readonly datos = new Map<number, Uint8Array>();

  constructor(private readonly db: Database) {}

  private async listaBloques(): Promise<Bloque[]> {
    if (this.bloques && this.bloques.hasta > Date.now()) return this.bloques.lista;
    const [filas] = await dbActual(this.db).execute(sql`SELECT id, xll, yll, cellsize, nrows, ncols, anio, fuente FROM cobertura_region`);
    const lista = (filas as unknown as Fila[]).map((f) => ({
      id: Number(f.id),
      xll: Number(f.xll),
      yll: Number(f.yll),
      cellsize: Number(f.cellsize),
      nrows: Number(f.nrows),
      ncols: Number(f.ncols),
      anio: Number(f.anio),
      fuente: String(f.fuente),
    }));
    this.bloques = { lista, hasta: Date.now() + VIGENCIA_BLOQUES_MS };
    return lista;
  }

  /** Bloque y píxel que contienen el punto, o null. */
  private async ubicar(lat: number, lon: number): Promise<{ bloque: Bloque; fila: number; columna: number } | null> {
    const { x, y } = aSinusoidal(lat, lon);
    for (const bloque of await this.listaBloques()) {
      const p = indicePixel(bloque, x, y);
      if (p) return { bloque, ...p };
    }
    return null;
  }

  async cubre(latitud: number, longitud: number): Promise<boolean> {
    try {
      return (await this.ubicar(latitud, longitud)) !== null;
    } catch {
      return false;
    }
  }

  async obtenerCobertura(latitud: number, longitud: number): Promise<Result<CoberturaModis | null, DomainError>> {
    try {
      const u = await this.ubicar(latitud, longitud);
      if (!u) return Result.ok(null);
      let bytes = this.datos.get(u.bloque.id);
      if (!bytes) {
        const [filas] = await dbActual(this.db).execute(sql`SELECT datos FROM cobertura_region WHERE id = ${u.bloque.id}`);
        const crudo = (filas as unknown as Fila[])[0]?.datos;
        if (!crudo) return Result.ok(null);
        bytes = new Uint8Array(crudo as Uint8Array);
        this.datos.set(u.bloque.id, bytes);
      }
      const clase = bytes[u.fila * u.bloque.ncols + u.columna];
      if (clase === undefined || clase < 1 || clase > 17) return Result.ok(null); // 255 = sin dato
      return Result.ok({ claseIgbp: clase, anio: u.bloque.anio, fuente: u.bloque.fuente });
    } catch (error) {
      return Result.err(
        new TerrenoProveedorNoDisponibleError("MODIS MCD12Q1 (precálculo regional)", error instanceof Error ? error.message.slice(0, 120) : "error de MySQL"),
      );
    }
  }
}
