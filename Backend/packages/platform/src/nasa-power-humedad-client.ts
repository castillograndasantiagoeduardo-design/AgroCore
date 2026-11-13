/**
 * NasaPowerHumedadClient: implementa IHumedadSueloProvider con la climatología mensual de NASA POWER
 * (humedad de suelo: superficie GWETTOP, zona de raíces GWETROOT y perfil GWETPROF, fracción 0-1).
 */
import { type ICacheProveedores, type IHumedadSueloProvider, TerrenoProveedorNoDisponibleError } from "@agrocore/core";
import type { HumedadSueloMensualDto } from "@agrocore/contracts";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, obtenerConCache } from "./cache/cache-en-memoria.ts";
import { describirError, fetchConReintentos } from "./http/fetch-con-reintentos.ts";

const FUENTE = "NASA POWER GWETTOP/GWETROOT/GWETPROF (climatología mensual)";
const MESES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface NasaPowerHumedadConfig {
  baseUrl?: string;
  timeoutMs?: number;
  cache?: ICacheProveedores;
}

/** Extrae los 12 meses de la respuesta de POWER; relleno (-999) pasa a null. Devuelve null si falta algún parámetro. Pura. */
export function parsearHumedadPower(json: unknown): HumedadSueloMensualDto[] | null {
  const j = json as {
    properties?: { parameter?: Record<string, Record<string, number> | undefined> };
    header?: { fill_value?: number };
  };
  const p = j?.properties?.parameter;
  if (!p?.GWETTOP || !p.GWETROOT || !p.GWETPROF) return null;
  const relleno = j.header?.fill_value ?? -999;
  const valor = (serie: Record<string, number>, mes: string): number | null => {
    const v = serie[mes];
    return typeof v !== "number" || v === relleno || v < 0 ? null : v;
  };
  return MESES.map((m, i) => ({
    mes: i + 1,
    superficie: valor(p.GWETTOP!, m),
    raiz: valor(p.GWETROOT!, m),
    perfil: valor(p.GWETPROF!, m),
  }));
}

export class NasaPowerHumedadClient implements IHumedadSueloProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cache?: ICacheProveedores;
  private readonly memoria = new CacheEnMemoria();

  constructor(config: NasaPowerHumedadConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://power.larc.nasa.gov/api/temporal/climatology/point";
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.cache = config.cache;
  }

  obtenerClimatologia(latitud: number, longitud: number) {
    const clave = ["nasa_power_humedad", latitud.toFixed(3), longitud.toFixed(3)].join(":");
    return obtenerConCache<{ fuente: string; meses: HumedadSueloMensualDto[] }>(
      clave,
      "nasa_power_humedad",
      365,
      this.memoria,
      this.cache,
      () => this.cargar(latitud, longitud),
    );
  }

  private async cargar(lat: number, lon: number): Promise<Result<{ fuente: string; meses: HumedadSueloMensualDto[] }, DomainError>> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("parameters", "GWETTOP,GWETROOT,GWETPROF");
    url.searchParams.set("community", "AG");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("format", "JSON");
    try {
      const r = await fetchConReintentos(url, {
        headers: { Accept: "application/json" },
        timeoutMs: this.timeoutMs,
        reintentos: 1,
        esperaInicialMs: 1500,
      });
      if (!r.ok) {
        await r.body?.cancel();
        return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE, "HTTP " + r.status));
      }
      const meses = parsearHumedadPower(await r.json());
      if (!meses) return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE, "respuesta sin los parámetros esperados"));
      return Result.ok({ fuente: FUENTE, meses });
    } catch (error) {
      return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE, describirError(error, this.timeoutMs)));
    }
  }
}
