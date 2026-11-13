/**
 * SoilGridsClient: implementa ISueloProvider con la API REST de ISRIC SoilGrids v2.0.
 * Promedia 0-5, 5-15 y 15-30 cm ponderando por espesor y convierte con unit_measure.d_factor.
 * Un solo intento: si ISRIC está caído debe fallar rápido (el caso de uso lo vuelve advertencia).
 */
import { type ICacheProveedores, type ISueloProvider, TerrenoProveedorNoDisponibleError } from "@agrocore/core";
import type { SueloDto } from "@agrocore/contracts";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, obtenerConCache } from "./cache/cache-en-memoria.ts";
import { ajustarAMetros } from "./cache/celdas.ts";
import { describirError, fetchConReintentos } from "./http/fetch-con-reintentos.ts";

const FUENTE = "ISRIC SoilGrids v2.0 (250 m)";
const ESPESORES_CM: Record<string, number> = { "0-5cm": 5, "5-15cm": 10, "15-30cm": 15 };

export interface SoilGridsConfig {
  baseUrl?: string;
  timeoutMs?: number;
  cache?: ICacheProveedores;
}

interface CapaSoilGrids {
  name?: string;
  unit_measure?: { d_factor?: number };
  depths?: { label?: string; values?: { mean?: number | null } }[];
}

/** Promedio ponderado por espesor de una capa, en unidades objetivo (valor / d_factor). */
function promedioCapa(capa: CapaSoilGrids | undefined): number | null {
  if (!capa) return null;
  const factor = capa.unit_measure?.d_factor ?? 1;
  if (!factor) return null;
  let suma = 0;
  let peso = 0;
  for (const d of capa.depths ?? []) {
    const espesor = ESPESORES_CM[d.label ?? ""];
    const mean = d.values?.mean;
    if (!espesor || typeof mean !== "number") continue;
    suma += (mean / factor) * espesor;
    peso += espesor;
  }
  return peso === 0 ? null : Math.round((suma / peso) * 100) / 100;
}

/** Convierte la respuesta de SoilGrids en SueloDto (textura = null). null si no hay ningún dato. Pura. */
export function parsearRespuestaSoilGrids(json: unknown): SueloDto | null {
  const capas = (json as { properties?: { layers?: CapaSoilGrids[] } })?.properties?.layers;
  if (!Array.isArray(capas)) return null;
  const de = (nombre: string) => promedioCapa(capas.find((c) => c.name === nombre));
  const suelo: SueloDto = {
    profundidadCm: "0-30",
    arenaPct: de("sand"),
    limoPct: de("silt"),
    arcillaPct: de("clay"),
    textura: null,
    ph: de("phh2o"),
    carbonoOrganicoGKg: de("soc"),
    nitrogenoGKg: de("nitrogen"),
    fuente: FUENTE,
  };
  const todoNulo = [suelo.arenaPct, suelo.limoPct, suelo.arcillaPct, suelo.ph, suelo.carbonoOrganicoGKg, suelo.nitrogenoGKg]
    .every((v) => v === null);
  return todoNulo ? null : suelo;
}

export class SoilGridsClient implements ISueloProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cache?: ICacheProveedores;
  private readonly memoria = new CacheEnMemoria();

  constructor(config: SoilGridsConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "https://rest.isric.org/soilgrids/v2.0").replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 6_000;
    this.cache = config.cache;
  }

  obtenerPropiedades(latitud: number, longitud: number): Promise<Result<SueloDto | null, DomainError>> {
    // Punto ajustado a 250 m (resolución de SoilGrids): consultas cercanas comparten caché.
    const p = ajustarAMetros(latitud, longitud, 250);
    const clave = ["soilgrids", p.latitud.toFixed(4), p.longitud.toFixed(4)].join(":");
    return obtenerConCache(clave, "soilgrids", 180, this.memoria, this.cache, () => this.cargar(p.latitud, p.longitud), 30 * 60_000);
  }

  private async cargar(lat: number, lon: number): Promise<Result<SueloDto | null, DomainError>> {
    const url = new URL(this.baseUrl + "/properties/query");
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("lat", String(lat));
    for (const p of ["sand", "silt", "clay", "phh2o", "soc", "nitrogen"]) url.searchParams.append("property", p);
    for (const d of Object.keys(ESPESORES_CM)) url.searchParams.append("depth", d);
    url.searchParams.set("value", "mean");
    try {
      const r = await fetchConReintentos(url, {
        headers: { Accept: "application/json" },
        timeoutMs: this.timeoutMs,
        reintentos: 0,
        esperaInicialMs: 0,
      });
      if (!r.ok) {
        await r.body?.cancel();
        return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE, "HTTP " + r.status));
      }
      return Result.ok(parsearRespuestaSoilGrids(await r.json()));
    } catch (error) {
      return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE, describirError(error, this.timeoutMs)));
    }
  }
}
