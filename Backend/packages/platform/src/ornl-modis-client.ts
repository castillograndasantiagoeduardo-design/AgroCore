/**
 * OrnlModisClient: NDVI (MOD13Q1) y cobertura del suelo (MCD12Q1) desde el servicio REST del ORNL DAAC.
 */
import {
  type CoberturaModis,
  type ICacheProveedores,
  type ICoberturaProvider,
  type INdviProvider,
  type SerieNdvi,
  TerrenoProveedorNoDisponibleError,
} from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, obtenerConCache } from "./cache/cache-en-memoria.ts";
import { describirError, fetchConReintentos } from "./http/fetch-con-reintentos.ts";
import { LimitadorConcurrencia } from "./http/limitador-concurrencia.ts";
import { ajustarAMetros } from "./cache/celdas.ts";

const FUENTE_NDVI = "NASA MODIS MOD13Q1 v061 NDVI 250 m (ORNL DAAC)";
const FUENTE_COBERTURA = "NASA MODIS MCD12Q1 v061 (IGBP, 500 m, ORNL DAAC)";
const GRUPO_MAX = 10;
const RELLENO_NDVI = -3000;
/** Un fallo de ORNL se recuerda 10 min para no pagar el timeout en cada consulta. */
const NEGATIVA_MS = 10 * 60_000;

export interface OrnlModisConfig {
  baseUrl?: string;
  timeoutMs?: number;
  concurrencia?: number;
  cache?: ICacheProveedores;
  /** Año de referencia para la cobertura; por defecto el año UTC actual. */
  anioReferencia?: number;
}

/** Convierte las muestras crudas del subset NDVI: escala 0.0001, descarta relleno y fuera de [-1,1]. Pura. */
export function parsearSubsetNdvi(json: unknown): { fecha: string; ndvi: number }[] {
  const subset = (json as { subset?: unknown })?.subset;
  if (!Array.isArray(subset)) return [];
  const salida: { fecha: string; ndvi: number }[] = [];
  for (const s of subset) {
    const crudo = s?.data?.[0];
    if (typeof crudo !== "number" || crudo === RELLENO_NDVI) continue;
    const ndvi = Math.round(crudo) / 10000;
    if (ndvi < -1 || ndvi > 1 || typeof s.calendar_date !== "string") continue;
    salida.push({ fecha: s.calendar_date, ndvi });
  }
  return salida;
}

/** Toma el registro más reciente con clase IGBP válida (1..17; 255 = sin dato). Pura. */
export function parsearSubsetCobertura(json: unknown): { claseIgbp: number; anio: number } | null {
  const subset = (json as { subset?: unknown })?.subset;
  if (!Array.isArray(subset)) return null;
  const ordenado = [...subset].sort((a, b) => String(b?.calendar_date).localeCompare(String(a?.calendar_date)));
  for (const s of ordenado) {
    const v = s?.data?.[0];
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 17) {
      return { claseIgbp: v, anio: Number(String(s.calendar_date).slice(0, 4)) };
    }
  }
  return null;
}

type FechaModis = { modis_date: string; calendar_date: string };

export class OrnlModisClient implements ICoberturaProvider, INdviProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly concurrencia: number;
  private readonly cache?: ICacheProveedores;
  private readonly anioReferencia?: number;
  private readonly memoria = new CacheEnMemoria();
  /** Limitadores SEPARADOS: la cobertura (1 petición) no espera detrás de los bloques de NDVI. */
  private readonly limitadorNdvi: LimitadorConcurrencia;
  private readonly limitadorCobertura = new LimitadorConcurrencia(2);

  constructor(config: OrnlModisConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "https://modis.ornl.gov/rst/api/v1").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.concurrencia = Math.max(1, config.concurrencia ?? 12);
    this.cache = config.cache;
    this.anioReferencia = config.anioReferencia;
    this.limitadorNdvi = new LimitadorConcurrencia(this.concurrencia);
  }

  private async getJson(url: string, limitador: LimitadorConcurrencia): Promise<unknown> {
    return await limitador.ejecutar(async () => {
      const r = await fetchConReintentos(url, {
        headers: { Accept: "application/json" },
        timeoutMs: this.timeoutMs,
        reintentos: 1,
        esperaInicialMs: 500,
      });
      if (!r.ok) {
        await r.body?.cancel();
        throw new Error("HTTP " + r.status);
      }
      return await r.json();
    });
  }

  obtenerSerie(latitud: number, longitud: number, desde: string, hasta: string): Promise<Result<SerieNdvi, DomainError>> {
    // Un píxel MODIS mide 250 m: el punto se ajusta a esa grilla para compartir caché entre consultas cercanas.
    const p = ajustarAMetros(latitud, longitud, 250);
    const clave = ["ornl_ndvi", p.latitud.toFixed(4), p.longitud.toFixed(4), desde, hasta].join(":");
    return obtenerConCache(
      clave,
      "ornl_ndvi",
      7,
      this.memoria,
      this.cache,
      () => this.cargarNdvi(p.latitud, p.longitud, desde, hasta),
      NEGATIVA_MS,
    );
  }

  private async cargarNdvi(lat: number, lon: number, desde: string, hasta: string): Promise<Result<SerieNdvi, DomainError>> {
    const coord = "latitude=" + lat + "&longitude=" + lon;
    let fechas: FechaModis[];
    try {
      const json = await this.getJson(this.baseUrl + "/MOD13Q1/dates?" + coord, this.limitadorNdvi) as { dates?: FechaModis[] };
      if (!Array.isArray(json?.dates)) throw new Error("respuesta sin dates");
      fechas = json.dates.filter((d) => d.calendar_date >= desde && d.calendar_date <= hasta);
    } catch (error) {
      return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE_NDVI, describirError(error, this.timeoutMs)));
    }

    const grupos: FechaModis[][] = [];
    for (let i = 0; i < fechas.length; i += GRUPO_MAX) grupos.push(fechas.slice(i, i + GRUPO_MAX));
    if (grupos.length === 0) return Result.ok({ fuente: FUENTE_NDVI, muestras: [] });

    // Todos los bloques de fechas salen en paralelo (el limitador acota las simultáneas). 1 solo píxel (km = 0).
    const muestras: { fecha: string; ndvi: number }[] = [];
    let fallidos = 0;
    let ultimoError = "";
    await Promise.all(grupos.map(async (g) => {
      const url = this.baseUrl + "/MOD13Q1/subset?" + coord + "&band=250m_16_days_NDVI&startDate=" + g[0].modis_date +
        "&endDate=" + g[g.length - 1].modis_date + "&kmAboveBelow=0&kmLeftRight=0";
      try {
        muestras.push(...parsearSubsetNdvi(await this.getJson(url, this.limitadorNdvi)));
      } catch (error) {
        fallidos++;
        ultimoError = describirError(error, this.timeoutMs);
      }
    }));

    if (fallidos / grupos.length > 0.3) {
      return Result.err(
        new TerrenoProveedorNoDisponibleError(
          FUENTE_NDVI,
          fallidos + " de " + grupos.length + " peticiones fallaron (" + ultimoError + ")",
        ),
      );
    }
    muestras.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return Result.ok({ fuente: FUENTE_NDVI, muestras });
  }

  obtenerCobertura(latitud: number, longitud: number): Promise<Result<CoberturaModis | null, DomainError>> {
    const p = ajustarAMetros(latitud, longitud, 250);
    const clave = ["ornl_cobertura", p.latitud.toFixed(4), p.longitud.toFixed(4)].join(":");
    return obtenerConCache(
      clave,
      "ornl_cobertura",
      30,
      this.memoria,
      this.cache,
      () => this.cargarCobertura(p.latitud, p.longitud),
      NEGATIVA_MS,
    );
  }

  private async cargarCobertura(lat: number, lon: number): Promise<Result<CoberturaModis | null, DomainError>> {
    const anio = this.anioReferencia ?? new Date().getUTCFullYear();
    const url = this.baseUrl + "/MCD12Q1/subset?latitude=" + lat + "&longitude=" + lon + "&band=LC_Type1&startDate=A" + (anio - 4) +
      "001&endDate=A" + anio + "001&kmAboveBelow=0&kmLeftRight=0";
    try {
      const dato = parsearSubsetCobertura(await this.getJson(url, this.limitadorCobertura));
      return Result.ok(dato ? { ...dato, fuente: FUENTE_COBERTURA } : null);
    } catch (error) {
      return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE_COBERTURA, describirError(error, this.timeoutMs)));
    }
  }
}
