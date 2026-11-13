/**
 * OverpassViasClient: implementa IViasProvider con la API Overpass de OpenStreetMap.
 * Consulta los espejos EN PARALELO (presupuesto total 8 s) y toma la primera respuesta válida.
 */
import {
  type ElementosOsm,
  type ICacheProveedores,
  type IViasProvider,
  TerrenoProveedorNoDisponibleError,
} from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, obtenerConCache } from "./cache/cache-en-memoria.ts";
import { describirError, USER_AGENT_POR_DEFECTO } from "./http/fetch-con-reintentos.ts";
import { cajaAjustada } from "./cache/celdas.ts";

const FUENTE = "OpenStreetMap (Overpass API)";
const TTL_DIAS = 30;
const NEGATIVA_MS = 10 * 60_000;
const ESPEJOS_POR_DEFECTO = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

type Punto = readonly [number, number];

export interface OverpassViasConfig {
  espejos?: string[];
  timeoutMs?: number;
  /** Obsoleto: los espejos ya se consultan en paralelo; se conserva para no romper la configuración existente. */
  rondas?: number;
  cache?: ICacheProveedores;
}

export function construirConsultaOverpass(caja: readonly [number, number, number, number]): string {
  const b = caja.join(",");
  return `[out:json][timeout:25];(way["highway"](${b});way["building"](${b});way["natural"="water"](${b});` +
    `way["landuse"~"^(reservoir|basin)$"](${b});way["waterway"~"^(river|canal)$"](${b}););out geom;`;
}

/** Convierte el JSON de Overpass en geometrías clasificadas. Pura: no usa red. */
export function parsearRespuestaOverpass(json: unknown): ElementosOsm {
  const resultado: ElementosOsm = { vias: [], edificaciones: [], aguaPoligonos: [], aguaLineas: [], fuente: FUENTE };
  const elementos = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elementos)) return resultado;

  for (const el of elementos) {
    if (!el || el.type !== "way" || !Array.isArray(el.geometry)) continue;
    const geometria: Punto[] = el.geometry
      .filter((p: { lat?: unknown; lon?: unknown }) => typeof p?.lat === "number" && typeof p?.lon === "number")
      .map((p: { lat: number; lon: number }) => [p.lat, p.lon] as Punto);
    if (geometria.length < 2) continue;
    const tags: Record<string, string> = el.tags ?? {};

    if (tags.highway) {
      resultado.vias.push({ tipo: tags.highway, nombre: tags.name ?? tags.ref ?? null, geometria });
    } else if (tags.building) {
      resultado.edificaciones.push(geometria);
    } else if (tags.natural === "water" || tags.landuse === "reservoir" || tags.landuse === "basin") {
      resultado.aguaPoligonos.push(geometria);
    } else if (tags.waterway === "river" || tags.waterway === "canal") {
      resultado.aguaLineas.push({ tipo: tags.waterway, geometria });
    }
  }
  return resultado;
}

export class OverpassViasClient implements IViasProvider {
  private readonly espejos: string[];
  private readonly timeoutMs: number;
  private readonly cache?: ICacheProveedores;
  private readonly memoria = new CacheEnMemoria();

  constructor(config: OverpassViasConfig = {}) {
    this.espejos = config.espejos ?? ESPEJOS_POR_DEFECTO;
    // Presupuesto TOTAL de la consulta (todos los espejos corren a la vez, así que es también el de cada uno).
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.cache = config.cache;
  }

  obtenerElementos(caja: readonly [number, number, number, number]): Promise<Result<ElementosOsm, DomainError>> {
    // La caja se expande hacia afuera a una grilla de ~50 m: consultas casi iguales comparten caché.
    const ajustada = cajaAjustada(caja, 50);
    const clave = "overpass:" + ajustada.map((v) => v.toFixed(5)).join(",");
    return obtenerConCache(clave, "overpass", TTL_DIAS, this.memoria, this.cache, () => this.cargar(ajustada), NEGATIVA_MS);
  }

  /** Consulta un espejo; lanza Error con el motivo si no devuelve un JSON Overpass válido. */
  private async consultarEspejo(espejo: string, cuerpo: string, senal: AbortSignal): Promise<ElementosOsm> {
    const nombre = espejo.replace(/^https?:\/\//, "").split("/")[0];
    let respuesta: Response;
    try {
      respuesta = await fetch(espejo, {
        method: "POST",
        body: cuerpo,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": USER_AGENT_POR_DEFECTO,
        },
        signal: senal,
      });
    } catch (error) {
      throw new Error(nombre + ": " + describirError(error, this.timeoutMs));
    }
    if (respuesta.status !== 200) {
      await respuesta.body?.cancel();
      throw new Error(nombre + ": HTTP " + respuesta.status);
    }
    let json: unknown;
    try {
      json = JSON.parse(await respuesta.text());
    } catch {
      throw new Error(nombre + ": respuesta no es JSON");
    }
    if (!json || !Array.isArray((json as { elements?: unknown }).elements)) {
      throw new Error(nombre + ": respuesta sin elements");
    }
    return parsearRespuestaOverpass(json);
  }

  /**
   * Consulta los espejos EN PARALELO con un presupuesto total (timeoutMs) y toma la primera respuesta válida;
   * al llegar, aborta las demás peticiones.
   */
  private async cargar(caja: readonly [number, number, number, number]): Promise<Result<ElementosOsm, DomainError>> {
    const cuerpo = "data=" + encodeURIComponent(construirConsultaOverpass(caja));
    const maestro = new AbortController();
    const senal = AbortSignal.any([maestro.signal, AbortSignal.timeout(this.timeoutMs)]);
    try {
      const elementos = await Promise.any(this.espejos.map((e) => this.consultarEspejo(e, cuerpo, senal)));
      return Result.ok(elementos);
    } catch (error) {
      const fallos = error instanceof AggregateError
        ? (error.errors as unknown[]).map((e) => (e instanceof Error ? e.message : String(e)))
        : [error instanceof Error ? error.message : String(error)];
      return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE, "todos los espejos fallaron: " + [...new Set(fallos)].join("; ")));
    } finally {
      maestro.abort(); // cancela las peticiones que sigan en vuelo
    }
  }
}
