/**
 * OpenTopoDataElevacionClient: implementa IElevacionProvider con OpenTopoData (SRTM 30 m, respaldo ASTER 30 m).
 * Límites del servicio público: 100 puntos por petición y 1 petición por segundo.
 */
import { type ElevacionPuntos, type ICacheProveedores, type IElevacionProvider, TerrenoProveedorNoDisponibleError } from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, obtenerConCache } from "./cache/cache-en-memoria.ts";
import { ajustarAMetros } from "./cache/celdas.ts";
import { describirError, fetchConReintentos } from "./http/fetch-con-reintentos.ts";

const MAX_PUNTOS = 100;
const ESPERA_ENTRE_PETICIONES_MS = 1100;
const FUENTES: Record<string, string> = {
  srtm30m: "NASA SRTM 30 m (vía OpenTopoData)",
  aster30m: "ASTER GDEM 30 m (vía OpenTopoData)",
};
const FUENTE_GENERICA = "OpenTopoData";

type Punto = readonly [number, number];

export interface OpenTopoDataConfig {
  baseUrl?: string;
  datasets?: string[];
  timeoutMs?: number;
  cache?: ICacheProveedores;
}

export class OpenTopoDataElevacionClient implements IElevacionProvider {
  private readonly baseUrl: string;
  private readonly datasets: string[];
  private readonly timeoutMs: number;
  private readonly cache?: ICacheProveedores;
  private readonly memoria = new CacheEnMemoria();
  private ultimaPeticionMs = 0;

  constructor(config: OpenTopoDataConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "https://api.opentopodata.org/v1").replace(/\/$/, "");
    this.datasets = config.datasets ?? ["srtm30m", "aster30m"];
    this.timeoutMs = config.timeoutMs ?? 6_000;
    this.cache = config.cache;
  }

  obtenerElevaciones(puntos: readonly Punto[]): Promise<Result<ElevacionPuntos, DomainError>> {
    // Puntos ajustados a 30 m (resolución de SRTM) en la clave; se consulta el punto original.
    const clave = "opentopodata:" + puntos.map((p) => {
      const a = ajustarAMetros(p[0], p[1], 30);
      return a.latitud.toFixed(5) + "," + a.longitud.toFixed(5);
    }).join("|");
    return obtenerConCache(clave, "opentopodata", 3650, this.memoria, this.cache, () => this.cargar(puntos), 10 * 60_000);
  }

  private async esperarTurno(): Promise<void> {
    const faltan = this.ultimaPeticionMs + ESPERA_ENTRE_PETICIONES_MS - Date.now();
    if (faltan > 0) await new Promise((r) => setTimeout(r, faltan));
    this.ultimaPeticionMs = Date.now();
  }

  private async consultar(dataset: string, puntos: readonly Punto[]): Promise<(number | null)[]> {
    const locations = puntos.map((p) => p[0].toFixed(5) + "," + p[1].toFixed(5)).join("|");
    await this.esperarTurno();
    const r = await fetchConReintentos(this.baseUrl + "/" + dataset + "?locations=" + locations, {
      headers: { Accept: "application/json" },
      timeoutMs: this.timeoutMs,
      reintentos: 1,
      esperaInicialMs: 1500,
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error("HTTP " + r.status);
    }
    const json = await r.json() as { results?: { elevation?: number | null }[] };
    if (!Array.isArray(json.results) || json.results.length !== puntos.length) throw new Error("respuesta inesperada");
    return json.results.map((x) => (typeof x.elevation === "number" ? x.elevation : null));
  }

  private async cargar(puntos: readonly Punto[]): Promise<Result<ElevacionPuntos, DomainError>> {
    if (puntos.length === 0) return Result.ok({ fuente: FUENTE_GENERICA, elevacionesM: [] });
    const elevaciones: (number | null)[] = puntos.map(() => null);
    const datasetsUsados = new Set<string>();
    try {
      let pendientes = puntos.map((_, i) => i);
      for (const dataset of this.datasets) {
        if (pendientes.length === 0) break;
        const siguientes: number[] = [];
        for (let i = 0; i < pendientes.length; i += MAX_PUNTOS) {
          const indices = pendientes.slice(i, i + MAX_PUNTOS);
          const valores = await this.consultar(dataset, indices.map((k) => puntos[k]));
          indices.forEach((k, j) => {
            if (valores[j] === null) siguientes.push(k);
            else {
              elevaciones[k] = valores[j];
              datasetsUsados.add(dataset);
            }
          });
        }
        pendientes = siguientes;
      }
    } catch (error) {
      return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE_GENERICA, describirError(error, this.timeoutMs)));
    }
    const ultimo = [...datasetsUsados].pop() ?? this.datasets[0];
    // Si se usó el respaldo se declara la fuente de respaldo; si no, la principal.
    const dataset = datasetsUsados.size > 1 ? ultimo : (datasetsUsados.values().next().value ?? this.datasets[0]);
    return Result.ok({ fuente: FUENTES[dataset] ?? FUENTE_GENERICA + " (" + dataset + ")", elevacionesM: elevaciones });
  }
}
