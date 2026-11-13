/**
 * OverpassViasClient: implementa IViasProvider con la API Overpass de OpenStreetMap.
 * Prueba varios espejos en orden: si uno falla (red, timeout, HTTP != 200, cuerpo no-JSON) pasa al siguiente.
 */
import {
  type ElementosOsm,
  type ICacheProveedores,
  type IViasProvider,
  TerrenoProveedorNoDisponibleError,
} from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, obtenerConCache } from "./cache/cache-en-memoria.ts";
import { describirError, fetchConReintentos } from "./http/fetch-con-reintentos.ts";

const FUENTE = "OpenStreetMap (Overpass API)";
const TTL_DIAS = 30;
const ESPEJOS_POR_DEFECTO = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

type Punto = readonly [number, number];

export interface OverpassViasConfig {
  espejos?: string[];
  timeoutMs?: number;
  /** Veces que se recorre la lista de espejos (por defecto 3). */
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
  private readonly rondas: number;
  private readonly cache?: ICacheProveedores;
  private readonly memoria = new CacheEnMemoria();

  constructor(config: OverpassViasConfig = {}) {
    this.espejos = config.espejos ?? ESPEJOS_POR_DEFECTO;
    this.timeoutMs = config.timeoutMs ?? 25_000;
    this.rondas = config.rondas ?? 3;
    this.cache = config.cache;
  }

  obtenerElementos(caja: readonly [number, number, number, number]): Promise<Result<ElementosOsm, DomainError>> {
    const clave = "overpass:" + caja.map((v) => v.toFixed(5)).join(",");
    return obtenerConCache(clave, "overpass", TTL_DIAS, this.memoria, this.cache, () => this.cargar(caja));
  }

  /**
   * Recorre los espejos hasta RONDAS veces con espera creciente (1 s, 2 s, 4 s...). Los espejos públicos
   * fallan a ratos ("at capacity" 502, 504 del proxy): suelen responder en un reintento. Un espejo que
   * agotó el tiempo no se vuelve a intentar en las rondas siguientes (no se sumarían otros 25 s).
   */
  private async cargar(caja: readonly [number, number, number, number]): Promise<Result<ElementosOsm, DomainError>> {
    const cuerpo = "data=" + encodeURIComponent(construirConsultaOverpass(caja));
    const fallos: string[] = [];
    const lentos = new Set<string>();
    let espera = 1000;
    let primero = true;
    for (let ronda = 1; ronda <= this.rondas; ronda++) {
      for (const espejo of this.espejos) {
        if (lentos.has(espejo)) continue;
        if (!primero) {
          await new Promise((r) => setTimeout(r, espera));
          espera = Math.min(espera * 2, 8000);
        }
        primero = false;
        const nombre = espejo.replace(/^https?:\/\//, "").split("/")[0];
        try {
          const respuesta = await fetchConReintentos(espejo, {
            method: "POST",
            body: cuerpo,
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            timeoutMs: this.timeoutMs,
            reintentos: 0,
            esperaInicialMs: 0,
          });
          if (respuesta.status !== 200) {
            await respuesta.body?.cancel();
            fallos.push(nombre + ": HTTP " + respuesta.status);
            continue;
          }
          const texto = await respuesta.text();
          let json: unknown;
          try {
            json = JSON.parse(texto);
          } catch {
            fallos.push(nombre + ": respuesta no es JSON");
            continue;
          }
          if (!json || !Array.isArray((json as { elements?: unknown }).elements)) {
            fallos.push(nombre + ": respuesta sin elements");
            continue;
          }
          return Result.ok(parsearRespuestaOverpass(json));
        } catch (error) {
          const detalle = describirError(error, this.timeoutMs);
          if (/tard[oó]/.test(detalle)) lentos.add(espejo);
          fallos.push(nombre + ": " + detalle);
        }
      }
    }
    return Result.err(new TerrenoProveedorNoDisponibleError(FUENTE, "todos los espejos fallaron: " + [...new Set(fallos)].join("; ")));
  }
}
