/**
 * NasaPowerClient: implementa IClimaProvider con la API diaria de NASA POWER.
 * Documentación: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
 *
 * Parámetros que pedimos (comunidad AG = agroclimatología):
 *   T2M          temperatura media del aire a 2 m (°C)
 *   T2M_MIN      temperatura mínima a 2 m (°C)
 *   T2M_MAX      temperatura máxima a 2 m (°C)
 *   PRECTOTCORR  lluvia corregida (mm/día)
 *
 * La respuesta trae también la altitud promedio de la celda en geometry.coordinates[2].
 * Los datos faltantes vienen como -999 y aquí se convierten en null.
 *
 * Caché en memoria: una consulta de 30 años tarda varios segundos; los datos históricos
 * no cambian, así que repetimos la respuesta mientras el servidor siga encendido.
 */
import {
  ClimaProveedorNoDisponibleError,
  type ICacheProveedores,
  type IClimaProvider,
  type RegistroClimaDiario,
  type SerieClimatica,
} from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, obtenerConCache } from "./cache/cache-en-memoria.ts";

const FUENTE = "NASA POWER";
const PARAMETROS = ["T2M", "T2M_MIN", "T2M_MAX", "PRECTOTCORR"] as const;
type Parametro = (typeof PARAMETROS)[number];

interface RespuestaPower {
  geometry?: { coordinates?: [number, number, number] };
  properties?: { parameter?: Partial<Record<Parametro, Record<string, number>>> };
  header?: { fill_value?: number };
  messages?: string[];
}

export interface NasaPowerConfig {
  baseUrl?: string;
  timeoutMs?: number;
  /** Caché persistente opcional (tabla cache_proveedores). */
  cache?: ICacheProveedores;
}

export class NasaPowerClient implements IClimaProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cachePersistente?: ICacheProveedores;
  private readonly memoria = new CacheEnMemoria();

  constructor(config: NasaPowerConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://power.larc.nasa.gov/api/temporal/daily/point";
    this.timeoutMs = config.timeoutMs ?? 90_000;
    this.cachePersistente = config.cache;
  }

  async obtenerSerieDiaria(consulta: { latitud: number; longitud: number; desde: string; hasta: string }): Promise<
    Result<SerieClimatica, DomainError>
  > {
    const clave = "nasa_power_diario:" +
      [consulta.latitud.toFixed(3), consulta.longitud.toFixed(3), consulta.desde, consulta.hasta].join(":");
    return obtenerConCache(clave, "nasa_power", 365, this.memoria, this.cachePersistente, () => this.cargar(consulta));
  }

  private async cargar(consulta: { latitud: number; longitud: number; desde: string; hasta: string }): Promise<
    Result<SerieClimatica, DomainError>
  > {
    const url = new URL(this.baseUrl);
    url.searchParams.set("parameters", PARAMETROS.join(","));
    url.searchParams.set("community", "AG");
    url.searchParams.set("latitude", String(consulta.latitud));
    url.searchParams.set("longitude", String(consulta.longitud));
    url.searchParams.set("start", consulta.desde.replaceAll("-", ""));
    url.searchParams.set("end", consulta.hasta.replaceAll("-", ""));
    url.searchParams.set("format", "JSON");

    let cuerpo: RespuestaPower;
    try {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!respuesta.ok) {
        return Result.err(new ClimaProveedorNoDisponibleError(FUENTE, "HTTP " + respuesta.status));
      }
      cuerpo = await respuesta.json();
    } catch (error) {
      const detalle = error instanceof DOMException && error.name === "TimeoutError"
        ? "tardó más de " + this.timeoutMs / 1000 + " s"
        : error instanceof Error
        ? error.message
        : String(error);
      return Result.err(new ClimaProveedorNoDisponibleError(FUENTE, detalle));
    }

    const altitudCeldaM = cuerpo.geometry?.coordinates?.[2];
    const p = cuerpo.properties?.parameter;
    if (altitudCeldaM === undefined || !p?.T2M || !p.T2M_MIN || !p.T2M_MAX || !p.PRECTOTCORR) {
      return Result.err(new ClimaProveedorNoDisponibleError(FUENTE, "respuesta sin los parámetros esperados"));
    }

    const relleno = cuerpo.header?.fill_value ?? -999;
    const valor = (serie: Record<string, number>, dia: string): number | null => {
      const v = serie[dia];
      return v === undefined || v === relleno ? null : v;
    };

    const registros: RegistroClimaDiario[] = Object.keys(p.T2M).sort().map((dia) => ({
      fecha: dia.slice(0, 4) + "-" + dia.slice(4, 6) + "-" + dia.slice(6, 8),
      tempMediaC: valor(p.T2M!, dia),
      tempMinC: valor(p.T2M_MIN!, dia),
      tempMaxC: valor(p.T2M_MAX!, dia),
      lluviaMm: valor(p.PRECTOTCORR!, dia),
    }));

    const serie: SerieClimatica = { fuente: FUENTE, altitudCeldaM, registros };
    return Result.ok(serie);
  }
}
