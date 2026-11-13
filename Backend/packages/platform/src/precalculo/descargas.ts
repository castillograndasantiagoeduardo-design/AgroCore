/**
 * Descargas por bloques para el precálculo regional (las usa scripts/precalcular-region.ts).
 * Son funciones sin estado: no guardan caché y LANZAN Error con el motivo si agotan los intentos
 * (el script decide si reintentar o marcar el bloque como "error").
 */
import type { LatLon } from "@agrocore/core";
import { describirError, fetchConReintentos, USER_AGENT_POR_DEFECTO } from "../http/fetch-con-reintentos.ts";

type Punto = LatLon;

// ---------- OpenStreetMap (Overpass) ----------

export const ESPEJOS_OVERPASS_PRECALCULO = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

export interface ViaOsmConId {
  osmId: number;
  tipo: string;
  nombre: string | null;
  geometria: Punto[];
}
export interface AnilloOsmConId {
  osmId: number;
  geometria: Punto[];
}
export interface AguaOsmConId {
  osmId: number;
  tipo: "poligono" | "river" | "canal";
  geometria: Punto[];
}
export interface BloqueOsm {
  vias: ViaOsmConId[];
  edificaciones: AnilloOsmConId[];
  agua: AguaOsmConId[];
}

/** Consulta Overpass de un bloque [sur, oeste, norte, este] con timeout de servidor de 120 s. */
export function consultaOverpassBloque(caja: readonly [number, number, number, number]): string {
  const b = caja.join(",");
  return `[out:json][timeout:120];(way["highway"](${b});way["building"](${b});way["natural"="water"](${b});` +
    `way["landuse"~"^(reservoir|basin)$"](${b});way["waterway"~"^(river|canal)$"](${b}););out geom;`;
}

/** Clasifica los `way` de Overpass conservando el id de OSM. Pura: no usa red. */
export function clasificarRespuestaOverpass(json: unknown): BloqueOsm {
  const salida: BloqueOsm = { vias: [], edificaciones: [], agua: [] };
  const elementos = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elementos)) return salida;
  for (const el of elementos) {
    if (!el || el.type !== "way" || typeof el.id !== "number" || !Array.isArray(el.geometry)) continue;
    const geometria: Punto[] = el.geometry
      .filter((p: { lat?: unknown; lon?: unknown }) => typeof p?.lat === "number" && typeof p?.lon === "number")
      .map((p: { lat: number; lon: number }) => [p.lat, p.lon] as Punto);
    if (geometria.length < 2) continue;
    const tags: Record<string, string> = el.tags ?? {};
    if (tags.highway) salida.vias.push({ osmId: el.id, tipo: tags.highway, nombre: tags.name ?? tags.ref ?? null, geometria });
    else if (tags.building) salida.edificaciones.push({ osmId: el.id, geometria });
    else if (tags.natural === "water" || tags.landuse === "reservoir" || tags.landuse === "basin") {
      salida.agua.push({ osmId: el.id, tipo: "poligono", geometria });
    } else if (tags.waterway === "river" || tags.waterway === "canal") {
      salida.agua.push({ osmId: el.id, tipo: tags.waterway, geometria });
    }
  }
  return salida;
}

/**
 * Descarga un bloque probando los espejos en orden, con `rondas` vueltas y pausa creciente entre vueltas.
 * Timeout por petición: 120 s (igual que el timeout del servidor).
 */
export async function descargarBloqueOsm(
  caja: readonly [number, number, number, number],
  opciones: { espejos?: string[]; rondas?: number; timeoutMs?: number; esperaMs?: number } = {},
): Promise<BloqueOsm> {
  const espejos = opciones.espejos ?? ESPEJOS_OVERPASS_PRECALCULO;
  const rondas = opciones.rondas ?? 2;
  const timeoutMs = opciones.timeoutMs ?? 120_000;
  const cuerpo = "data=" + encodeURIComponent(consultaOverpassBloque(caja));
  const fallos: string[] = [];
  for (let ronda = 0; ronda < rondas; ronda++) {
    for (const espejo of espejos) {
      const nombre = espejo.replace(/^https?:\/\//, "").split("/")[0];
      try {
        const r = await fetch(espejo, {
          method: "POST",
          body: cuerpo,
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": USER_AGENT_POR_DEFECTO },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (r.status !== 200) {
          await r.body?.cancel();
          throw new Error("HTTP " + r.status);
        }
        const json = JSON.parse(await r.text());
        if (!Array.isArray(json?.elements)) throw new Error("respuesta sin elements");
        // Overpass devuelve 200 con "remark" si se cortó por tiempo o memoria: el bloque quedaría incompleto.
        if (typeof json.remark === "string" && /runtime error|timed out|out of memory/i.test(json.remark)) {
          throw new Error("Overpass cortó la consulta: " + json.remark.slice(0, 80));
        }
        return clasificarRespuestaOverpass(json);
      } catch (error) {
        fallos.push(nombre + ": " + describirError(error, timeoutMs));
      }
    }
    if (ronda < rondas - 1) await new Promise((res) => setTimeout(res, (opciones.esperaMs ?? 5_000) * (ronda + 1)));
  }
  throw new Error([...new Set(fallos)].join("; "));
}

// ---------- MODIS MCD12Q1 (subset de ORNL) ----------

export interface SubsetCobertura {
  xll: number;
  yll: number;
  cellsize: number;
  nrows: number;
  ncols: number;
  anio: number;
  /** 1 byte por píxel (LC_Type1; 255 = sin dato), por filas, fila 0 al norte. */
  datos: Uint8Array;
}

/** Convierte la respuesta del subset de ORNL. Pura: no usa red. Devuelve null si no tiene la forma esperada. */
export function parsearSubsetBloque(json: unknown): SubsetCobertura | null {
  const j = json as {
    xllcorner?: string | number;
    yllcorner?: string | number;
    cellsize?: number;
    nrows?: number;
    ncols?: number;
    subset?: { calendar_date?: string; data?: number[] }[];
  };
  const dato = Array.isArray(j?.subset) ? j.subset[0] : undefined;
  if (!dato || !Array.isArray(dato.data) || !j.nrows || !j.ncols || !j.cellsize) return null;
  if (dato.data.length !== j.nrows * j.ncols) return null;
  const datos = new Uint8Array(dato.data.length);
  for (let k = 0; k < dato.data.length; k++) {
    const v = dato.data[k];
    datos[k] = Number.isInteger(v) && v >= 0 && v <= 255 ? v : 255;
  }
  return {
    xll: Number(j.xllcorner),
    yll: Number(j.yllcorner),
    cellsize: j.cellsize,
    nrows: j.nrows,
    ncols: j.ncols,
    anio: Number(String(dato.calendar_date).slice(0, 4)),
    datos,
  };
}

/** Último año disponible de MCD12Q1 en ORNL (consulta de fechas de un punto). */
export async function ultimaFechaCoberturaModis(base = "https://modis.ornl.gov/rst/api/v1"): Promise<string> {
  const r = await fetchConReintentos(base + "/MCD12Q1/dates?latitude=5.78&longitude=-73.03", {
    headers: { Accept: "application/json" },
    timeoutMs: 30_000,
    reintentos: 2,
    esperaInicialMs: 2_000,
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const fechas = (await r.json() as { dates?: { modis_date: string }[] }).dates;
  const ultima = fechas?.[fechas.length - 1]?.modis_date;
  if (!ultima) throw new Error("ORNL no devolvió fechas de MCD12Q1");
  return ultima;
}

/**
 * Subset de LC_Type1 centrado en el punto, de (2·km+1) km de lado (ORNL permite hasta 100 km a cada lado).
 * `fecha` en formato MODIS (A2023001).
 */
export async function descargarSubsetCobertura(
  latitud: number,
  longitud: number,
  fecha: string,
  km = 100,
  base = "https://modis.ornl.gov/rst/api/v1",
): Promise<SubsetCobertura> {
  const url = base + "/MCD12Q1/subset?latitude=" + latitud + "&longitude=" + longitud + "&band=LC_Type1&startDate=" + fecha +
    "&endDate=" + fecha + "&kmAboveBelow=" + km + "&kmLeftRight=" + km;
  const r = await fetchConReintentos(url, { headers: { Accept: "application/json" }, timeoutMs: 120_000, reintentos: 2, esperaInicialMs: 5_000 });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error("HTTP " + r.status);
  }
  const subset = parsearSubsetBloque(await r.json());
  if (!subset) throw new Error("subset de ORNL con formato inesperado");
  return subset;
}

// ---------- Elevación (OpenTopoData, SRTM 30 m) ----------

/** Una petición (≤ 100 puntos). El servicio público permite 1 petición por segundo y 1000 por día. */
export async function descargarElevaciones(puntos: readonly Punto[], dataset = "srtm30m"): Promise<(number | null)[]> {
  if (puntos.length === 0) return [];
  if (puntos.length > 100) throw new RangeError("OpenTopoData acepta hasta 100 puntos por petición");
  const locations = puntos.map((p) => p[0].toFixed(5) + "," + p[1].toFixed(5)).join("|");
  const r = await fetchConReintentos("https://api.opentopodata.org/v1/" + dataset + "?locations=" + locations, {
    headers: { Accept: "application/json" },
    timeoutMs: 30_000,
    reintentos: 3,
    esperaInicialMs: 3_000,
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error("HTTP " + r.status);
  }
  const json = await r.json() as { results?: { elevation?: number | null }[] };
  if (!Array.isArray(json.results) || json.results.length !== puntos.length) throw new Error("respuesta inesperada");
  return json.results.map((x) => (typeof x.elevation === "number" ? x.elevation : null));
}
