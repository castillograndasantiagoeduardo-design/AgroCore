/**
 * NasaPowerClimatologiaClient: implementa IClimatologiaProvider con la climatología mensual de NASA POWER
 * (/api/temporal/climatology/point): una sola petición rápida con promedios de largo plazo.
 *
 * Parámetros: T2M, T2M_MIN, T2M_MAX (°C), PRECTOTCORR (mm/día) y FROST_DAYS (días de helada al mes).
 * Meses con claves JAN..DEC (y ANN, que se ignora). El periodo sale de header.range
 * ("... (January 2001 - December 2025)"); la altitud de la celda, de geometry.coordinates[2].
 * Se consulta el centro de la celda de POWER y la caché se comparte entre todos sus puntos.
 */
import {
  ClimaProveedorNoDisponibleError,
  type ClimatologiaMensual,
  type IClimatologiaProvider,
  type ICacheProveedores,
  type MesClimatologia,
} from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, obtenerConCache } from "./cache/cache-en-memoria.ts";
import { celdaPower } from "./cache/celdas.ts";
import { describirError, fetchConReintentos } from "./http/fetch-con-reintentos.ts";

const FUENTE = "NASA POWER (climatología mensual)";
const CLAVES_MES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Días de cada mes; febrero 28,25 promedia los bisiestos. */
const DIAS_MES = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const NEGATIVA_MS = 10 * 60_000;

export interface NasaPowerClimatologiaConfig {
  baseUrl?: string;
  timeoutMs?: number;
  cache?: ICacheProveedores;
}

type Serie = Record<string, number> | undefined;

/** Extrae "2001-2025" del texto de header.range; si no lo reconoce, devuelve "largo plazo". */
function extraerPeriodo(rango: unknown): string {
  const anios = typeof rango === "string" ? rango.match(/\b(19|20)\d{2}\b/g) : null;
  if (!anios || anios.length < 2) return "largo plazo";
  return anios[0] + "-" + anios[anios.length - 1];
}

/** Convierte la respuesta de POWER en ClimatologiaMensual. null si falta algún parámetro obligatorio. Pura. */
export function parsearClimatologiaPower(json: unknown): ClimatologiaMensual | null {
  const j = json as {
    geometry?: { coordinates?: number[] };
    properties?: { parameter?: Record<string, Serie> };
    header?: { fill_value?: number; range?: string };
  };
  const p = j?.properties?.parameter;
  const altitud = j?.geometry?.coordinates?.[2];
  if (!p?.T2M || !p.T2M_MIN || !p.T2M_MAX || !p.PRECTOTCORR || typeof altitud !== "number") return null;
  const relleno = j.header?.fill_value ?? -999;
  const num = (s: Serie, m: string): number | null => {
    const v = s?.[m];
    return typeof v !== "number" || v === relleno ? null : v;
  };

  const meses: MesClimatologia[] = [];
  for (let i = 0; i < 12; i++) {
    const m = CLAVES_MES[i];
    const media = num(p.T2M, m);
    const min = num(p.T2M_MIN, m);
    const max = num(p.T2M_MAX, m);
    const lluviaDia = num(p.PRECTOTCORR, m);
    if (media === null || min === null || max === null || lluviaDia === null) return null;
    meses.push({
      mes: i + 1,
      tempMediaC: media,
      tempMinC: min,
      tempMaxC: max,
      lluviaMm: Math.round(lluviaDia * DIAS_MES[i] * 10) / 10,
      diasHelada: num(p.FROST_DAYS, m),
    });
  }
  return { fuente: FUENTE, periodo: extraerPeriodo(j.header?.range), altitudCeldaM: altitud, meses };
}


export class NasaPowerClimatologiaClient implements IClimatologiaProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cache?: ICacheProveedores;
  private readonly memoria = new CacheEnMemoria();

  constructor(config: NasaPowerClimatologiaConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://power.larc.nasa.gov/api/temporal/climatology/point";
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.cache = config.cache;
  }

  obtenerClimatologia(latitud: number, longitud: number): Promise<Result<ClimatologiaMensual, DomainError>> {
    const celda = celdaPower(latitud, longitud);
    return obtenerConCache(
      "nasa_power_climatologia:" + celda.clave,
      "nasa_power_climatologia",
      30,
      this.memoria,
      this.cache,
      () => this.cargar(celda.latitud, celda.longitud),
      NEGATIVA_MS,
    );
  }

  private async cargar(lat: number, lon: number): Promise<Result<ClimatologiaMensual, DomainError>> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("parameters", "T2M,T2M_MIN,T2M_MAX,PRECTOTCORR,FROST_DAYS");
    url.searchParams.set("community", "AG");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("format", "JSON");
    try {
      const r = await fetchConReintentos(url, {
        headers: { Accept: "application/json" },
        timeoutMs: this.timeoutMs,
        reintentos: 0,
        esperaInicialMs: 0,
      });
      if (!r.ok) {
        await r.body?.cancel();
        return Result.err(new ClimaProveedorNoDisponibleError("NASA POWER", "HTTP " + r.status));
      }
      const clima = parsearClimatologiaPower(await r.json());
      if (!clima) return Result.err(new ClimaProveedorNoDisponibleError("NASA POWER", "respuesta sin los parámetros esperados"));
      return Result.ok(clima);
    } catch (error) {
      return Result.err(new ClimaProveedorNoDisponibleError("NASA POWER", describirError(error, this.timeoutMs)));
    }
  }
}
