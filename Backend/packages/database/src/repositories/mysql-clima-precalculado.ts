/**
 * MySqlClimaPrecalculado: implementa IClimaProvider con la serie diaria de 30 años guardada por celda de
 * NASA POWER en precalculo_celdas (gzip de la SerieClimatica en JSON). `cubre` dice si hay una celda con el
 * mismo periodo pedido. Mantiene en memoria las últimas celdas leídas (descomprimir tarda unos ms).
 */
import { ClimaProveedorNoDisponibleError, type IClimaProvider, type SerieClimatica } from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { sql } from "drizzle-orm";
import type { Database } from "../connection.ts";
import { dbActual } from "../unit-of-work.ts";
import { descomprimirJson } from "../precalculo/gzip.ts";

/** Celda de NASA POWER (0,5° de latitud × 0,625° de longitud). Misma fórmula que platform/cache/celdas.ts. */
export function indiceCeldaPower(latitud: number, longitud: number): { i: number; j: number } {
  return { i: Math.floor((latitud + 90) / 0.5), j: Math.floor((longitud + 180) / 0.625) };
}

const MAX_EN_MEMORIA = 24;

type Fila = Record<string, unknown>;

export class MySqlClimaPrecalculado implements IClimaProvider {
  private readonly memoria = new Map<string, SerieClimatica>();

  constructor(private readonly db: Database) {}

  private async cargar(lat: number, lon: number, desde: string, hasta: string): Promise<SerieClimatica | null> {
    const { i, j } = indiceCeldaPower(lat, lon);
    const clave = [i, j, desde, hasta].join(":");
    const guardada = this.memoria.get(clave);
    if (guardada) return guardada;
    const [filas] = await dbActual(this.db).execute(sql`
      SELECT serie_diaria FROM precalculo_celdas
      WHERE celda_i = ${i} AND celda_j = ${j}
        AND desde = ${desde} AND hasta = ${hasta}`);
    const crudo = (filas as unknown as Fila[])[0]?.serie_diaria;
    if (!crudo) return null;
    const serie = await descomprimirJson<SerieClimatica>(new Uint8Array(crudo as Uint8Array));
    if (this.memoria.size >= MAX_EN_MEMORIA) this.memoria.delete(this.memoria.keys().next().value!);
    this.memoria.set(clave, serie);
    return serie;
  }

  async cubre(latitud: number, longitud: number, desde: string, hasta: string): Promise<boolean> {
    try {
      return (await this.cargar(latitud, longitud, desde, hasta)) !== null;
    } catch {
      return false;
    }
  }

  async obtenerSerieDiaria(consulta: { latitud: number; longitud: number; desde: string; hasta: string }): Promise<
    Result<SerieClimatica, DomainError>
  > {
    try {
      const serie = await this.cargar(consulta.latitud, consulta.longitud, consulta.desde, consulta.hasta);
      if (!serie) return Result.err(new ClimaProveedorNoDisponibleError("NASA POWER (precálculo)", "la celda no está precalculada"));
      return Result.ok(serie);
    } catch (error) {
      return Result.err(
        new ClimaProveedorNoDisponibleError("NASA POWER (precálculo)", error instanceof Error ? error.message.slice(0, 120) : "error de MySQL"),
      );
    }
  }
}
