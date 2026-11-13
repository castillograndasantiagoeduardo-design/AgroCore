/**
 * PresenciaLocalClient: implementa IPresenciaLocalProvider.
 *
 *   Colombia (M49 170): EVA (Evaluaciones Agropecuarias Municipales, datos.gov.co) de los municipios DIVIPOLA cuyo
 *     centroide está a <= RADIO_ZONA_KM del punto (si ninguno, el más cercano). Suma dos conjuntos Socrata:
 *     uejq-wxrr (2019 en adelante) y 2pnw-mmge (2006-2018). Hectáreas = promedio anual del periodo 2015-hoy.
 *     EVA se consulta UNA vez por departamento (agrupado por municipio y cultivo) y se guarda en la caché de archivos;
 *     la zona de 25 km se suma localmente (puede tocar 2 departamentos: se consultan los que falten).
 *   Resto del mundo: FAOSTAT del país (área cosechada promedio 2018-2022) desde un JSON local.
 *
 * El país del punto se decide con un punto-en-polígono sobre Natural Earth 1:50m (archivo local).
 * Los archivos de datos se leen una sola vez por instancia (perezoso).
 * Caché: EVA se guarda por departamento en archivos JSON (TTL 180 días) y en memoria; los fallos, 10 min en memoria.
 * FAOSTAT no necesita caché de archivo: se calcula al instante desde el JSON local.
 */
import {
  distanciaKm,
  type IPresenciaLocalProvider,
  type PresenciaLocal,
  PresenciaLocalNoDisponibleError,
  RADIO_ZONA_KM,
} from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { CacheArchivo, directorioCachePorDefecto } from "../cache/cache-archivo.ts";
import { CacheEnMemoria, obtenerConCache } from "../cache/cache-en-memoria.ts";
import { describirError, fetchConReintentos } from "../http/fetch-con-reintentos.ts";

const M49_COLOMBIA = "170";
const ANIO_INICIO_EVA = 2015;
const NEGATIVA_MS = 10 * 60_000;
const TTL_DIAS = 180;
/** La consulta agrupada de un departamento tarda hasta ~10 s en datos.gov.co. */
const EVA_TIMEOUT_MS = 45_000;
const URL_EVA_RECIENTE = "https://www.datos.gov.co/resource/uejq-wxrr.json";
const URL_EVA_HISTORICO = "https://www.datos.gov.co/resource/2pnw-mmge.json";

/**
 * Nombres de cultivo de EVA (normalizados: minúsculas, sin tildes) por clave del catálogo.
 * Un nombre de EVA que no esté aquí no se cuenta (café, plátano, frutales...: no son cultivos del catálogo).
 */
export const ALIAS_EVA: Record<string, string[]> = {
  maiz: ["maiz"],
  trigo: ["trigo"],
  cebada: ["cebada"],
  avena: ["avena"],
  centeno: ["centeno"],
  arroz: ["arroz"],
  sorgo: ["sorgo"],
  mijo_perla: ["mijo"],
  amaranto: ["amaranto"],
  quinua: ["quinua"],
  trigo_sarraceno: ["trigo sarraceno"],
  frijol: ["frijol"],
  arveja: ["arveja"],
  haba: ["haba"],
  garbanzo: ["garbanzo"],
  lenteja: ["lenteja"],
  soya: ["soya", "soja"],
  mani: ["mani"],
  caupi: ["frijol caupi", "caupi"],
  gandul: ["guandul", "gandul"],
  tarwi: ["chocho", "tarwi"],
  papa: ["papa"],
  yuca: ["yuca"],
  batata: ["batata"],
  oca: ["oca"],
  remolacha: ["remolacha"],
  zanahoria: ["zanahoria"],
  cebolla_bulbo: ["cebolla de bulbo"],
  ajo: ["ajo"],
  tomate: ["tomate"],
  repollo: ["repollo"],
  lechuga: ["lechuga"],
  calabaza: ["ahuyama", "calabacin, calabaza", "calabaza", "zapallo"],
  pepino: ["pepino cohombro", "pepino"],
  pimiento: ["pimenton"],
  girasol: ["girasol"],
  colza: ["colza"],
  sesamo: ["ajonjoli"],
  algodon: ["algodon"],
  lino: ["lino"],
};

const NOMBRE_A_CLAVE: Map<string, string> = new Map(
  Object.entries(ALIAS_EVA).flatMap(([clave, nombres]) => nombres.map((n) => [n, clave] as const)),
);

/** Minúsculas, sin tildes y con espacios simples. */
export function normalizarNombreEva(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Clave del catálogo para un nombre de cultivo de EVA, o null si no es un cultivo del catálogo. Pura. */
export function claveDesdeNombreEva(nombre: string): string | null {
  return NOMBRE_A_CLAVE.get(normalizarNombreEva(nombre)) ?? null;
}

// ---------- País del punto ----------

type Anillo = number[][];
type Geometria = { type: "Polygon"; coordinates: Anillo[] } | { type: "MultiPolygon"; coordinates: Anillo[][] };
interface PaisGeo {
  m49: string;
  nombre: string;
  poligonos: Anillo[][];
  /** [oeste, sur, este, norte] de cada polígono, para descartar rápido. */
  cajas: [number, number, number, number][];
}

function dentroDeAnillo(lon: number, lat: number, anillo: Anillo): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Punto-en-polígono con huecos: dentro del anillo exterior y fuera de los interiores. */
function dentroDePoligono(lon: number, lat: number, anillos: Anillo[]): boolean {
  if (!dentroDeAnillo(lon, lat, anillos[0])) return false;
  for (let k = 1; k < anillos.length; k++) if (dentroDeAnillo(lon, lat, anillos[k])) return false;
  return true;
}

function cajaDe(anillo: Anillo): [number, number, number, number] {
  let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of anillo) {
    if (x < o) o = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [o, s, e, n];
}

// ---------- Datos locales ----------

interface DatoFaostat {
  areaHa: number;
  valorHa: number | null;
}
interface MunicipioDivipola {
  codigo: string;
  nombre: string;
  departamento: string;
  lat: number;
  lon: number;
}
/** EVA de un departamento: hectáreas sembradas desde 2015 por municipio (código DANE de 5 dígitos) y cultivo del catálogo. */
export interface EvaDepartamento {
  /** Código DANE de 2 dígitos. */
  departamento: string;
  anioMax: number;
  municipios: Record<string, Record<string, number>>;
}

export interface PresenciaLocalConfig {
  /** Directorio de la caché de archivos (TTL 180 días); por defecto Backend/.cache/presencia/. */
  directorioCache?: string;
  timeoutMs?: number;
  /** Directorio (URL terminada en "/") con faostat-cultivos.json, divipola-municipios.json y paises-ne50m.geojson. */
  directorioDatos?: URL;
}

/** "SAN JOSÉ DE LA MONTAÑA" -> "San José de la Montaña". */
function aTitulo(texto: string): string {
  return texto.toLowerCase().split(" ").map((p, i) =>
    i > 0 && ["de", "del", "la", "las", "los", "y"].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)
  ).join(" ");
}

export class PresenciaLocalClient implements IPresenciaLocalProvider {
  private readonly timeoutMs: number;
  private readonly directorioDatos: URL;
  private readonly cacheArchivo: CacheArchivo;
  private readonly memoria = new CacheEnMemoria();
  private paises: PaisGeo[] | null = null;
  private faostat: Record<string, Record<string, DatoFaostat>> | null = null;
  private municipios: MunicipioDivipola[] | null = null;
  private clavesFaostat: string[] = [];

  constructor(config: PresenciaLocalConfig = {}) {
    this.timeoutMs = config.timeoutMs ?? 8_000;
    this.directorioDatos = config.directorioDatos ?? new URL("../../data/", import.meta.url);
    this.cacheArchivo = new CacheArchivo(config.directorioCache ?? directorioCachePorDefecto("presencia"), TTL_DIAS);
  }

  // ---- carga perezosa ----

  private async leerJson<T>(archivo: string): Promise<T> {
    return JSON.parse(await Deno.readTextFile(new URL(archivo, this.directorioDatos)));
  }

  private async cargarPaises(): Promise<PaisGeo[]> {
    if (this.paises) return this.paises;
    const geo = await this.leerJson<{
      features: { properties: { m49: string; nombre: string }; geometry: Geometria | null }[];
    }>("paises-ne50m.geojson");
    this.paises = geo.features.filter((f) => f.geometry).map((f) => {
      const g = f.geometry!;
      const poligonos = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      return {
        m49: String(f.properties.m49).padStart(3, "0"),
        nombre: f.properties.nombre,
        poligonos,
        cajas: poligonos.map((p) => cajaDe(p[0])),
      };
    });
    return this.paises;
  }

  private async cargarFaostat(): Promise<Record<string, Record<string, DatoFaostat>>> {
    if (this.faostat) return this.faostat;
    const json = await this.leerJson<{ paises: Record<string, Record<string, DatoFaostat>> }>("faostat-cultivos.json");
    this.faostat = json.paises;
    this.clavesFaostat = [...new Set(Object.values(json.paises).flatMap((p) => Object.keys(p)))];
    return this.faostat;
  }

  private async cargarMunicipios(): Promise<MunicipioDivipola[]> {
    if (this.municipios) return this.municipios;
    this.municipios = (await this.leerJson<{ municipios: MunicipioDivipola[] }>("divipola-municipios.json")).municipios;
    return this.municipios;
  }

  /** País (M49 de 3 dígitos y nombre) que contiene el punto, o null (mar, sin cobertura). */
  async paisDelPunto(latitud: number, longitud: number): Promise<{ m49: string; nombre: string } | null> {
    for (const pais of await this.cargarPaises()) {
      for (let i = 0; i < pais.poligonos.length; i++) {
        const [o, s, e, n] = pais.cajas[i];
        if (longitud < o || longitud > e || latitud < s || latitud > n) continue;
        if (dentroDePoligono(longitud, latitud, pais.poligonos[i])) return { m49: pais.m49, nombre: pais.nombre };
      }
    }
    return null;
  }

  // ---- API ----

  async obtenerPresencia(latitud: number, longitud: number): Promise<Result<PresenciaLocal | null, DomainError>> {
    let pais: { m49: string; nombre: string } | null;
    try {
      pais = await this.paisDelPunto(latitud, longitud);
    } catch (error) {
      return Result.err(new PresenciaLocalNoDisponibleError("datos locales de países", describirError(error)));
    }
    if (!pais) return Result.ok(null);
    if (pais.m49 === M49_COLOMBIA) return await this.presenciaColombia(latitud, longitud);
    return await this.presenciaFaostat(pais);
  }

  private async presenciaFaostat(pais: { m49: string; nombre: string }): Promise<Result<PresenciaLocal | null, DomainError>> {
    let datos: Record<string, DatoFaostat> | undefined;
    try {
      datos = (await this.cargarFaostat())[pais.m49];
    } catch (error) {
      return Result.err(new PresenciaLocalNoDisponibleError("FAOSTAT (datos locales)", describirError(error)));
    }
    if (!datos) return Result.ok(null);
    const areaPorCultivo: Record<string, number> = {};
    const valorProduccionHaPais: Record<string, number> = {};
    for (const [clave, d] of Object.entries(datos)) {
      if (d.areaHa > 0) areaPorCultivo[clave] = d.areaHa;
      if (d.valorHa !== null && d.valorHa !== undefined) valorProduccionHaPais[clave] = d.valorHa;
    }
    return Result.ok({
      fuente: "FAOSTAT",
      ambito: pais.nombre,
      periodo: "2018-2022",
      areaPorCultivo,
      cultivosCubiertos: [...this.clavesFaostat],
      valorProduccionHaPais,
      pais: pais.nombre,
    });
  }

  private async presenciaColombia(lat: number, lon: number): Promise<Result<PresenciaLocal | null, DomainError>> {
    let codigos: string[];
    let ambito: string;
    const valorProduccionHaPais: Record<string, number> = {};
    try {
      const municipios = await this.cargarMunicipios();
      const ordenados = municipios.map((m) => ({ m, d: distanciaKm(lat, lon, m.lat, m.lon) })).sort((a, b) => a.d - b.d);
      if (ordenados.length === 0) return Result.err(new PresenciaLocalNoDisponibleError("DIVIPOLA", "sin municipios"));
      const cercanos = ordenados.filter((x) => x.d <= RADIO_ZONA_KM);
      const elegidos = cercanos.length > 0 ? cercanos : [ordenados[0]];
      const otros = elegidos.length - 1;
      codigos = elegidos.map((x) => x.m.codigo).sort();
      ambito = aTitulo(elegidos[0].m.nombre) + (otros > 0 ? " y " + otros + " municipios a menos de " + RADIO_ZONA_KM + " km" : "");
      const fao = (await this.cargarFaostat())[M49_COLOMBIA] ?? {};
      for (const [clave, d] of Object.entries(fao)) {
        if (d.valorHa !== null && d.valorHa !== undefined) valorProduccionHaPais[clave] = d.valorHa;
      }
    } catch (error) {
      return Result.err(new PresenciaLocalNoDisponibleError("datos locales (DIVIPOLA/FAOSTAT)", describirError(error)));
    }

    // EVA se consulta UNA vez por departamento y se guarda; la zona de 25 km se suma localmente.
    const departamentos = [...new Set(codigos.map((c) => c.slice(0, 2)))];
    const porDepartamento = await Promise.all(departamentos.map((d) => this.evaDepartamento(d)));
    const fallo = porDepartamento.find((r) => !r.ok);
    if (fallo && !fallo.ok) return fallo;
    const datos = porDepartamento.map((r) => (r.ok ? r.value : null)).filter((v): v is EvaDepartamento => v !== null);
    const anioMax = Math.max(ANIO_INICIO_EVA, ...datos.map((d) => d.anioMax));
    const anios = anioMax - ANIO_INICIO_EVA + 1;
    const suma: Record<string, number> = {};
    for (const codigo of codigos) {
      const dep = datos.find((d) => d.departamento === codigo.slice(0, 2));
      for (const [cultivo, ha] of Object.entries(dep?.municipios[codigo] ?? {})) suma[cultivo] = (suma[cultivo] ?? 0) + ha;
    }
    const areaPorCultivo: Record<string, number> = {};
    for (const [c, ha] of Object.entries(suma)) {
      const promedio = Math.round((ha / anios) * 10) / 10;
      if (promedio > 0) areaPorCultivo[c] = promedio;
    }
    return Result.ok({
      fuente: "EVA",
      ambito,
      periodo: ANIO_INICIO_EVA + "-" + anioMax,
      areaPorCultivo,
      cultivosCubiertos: Object.keys(ALIAS_EVA),
      valorProduccionHaPais,
      pais: "Colombia",
    });
  }

  /**
   * Hectáreas sembradas desde 2015 por municipio y cultivo del catálogo, de un departamento (código DANE de 2 dígitos).
   * Caché en memoria y en archivo (180 días): tras la primera consulta (o el precálculo) cualquier punto del
   * departamento sale en milisegundos.
   */
  evaDepartamento(departamento: string): Promise<Result<EvaDepartamento, DomainError>> {
    const clave = "eva-dep:" + departamento;
    return obtenerConCache<EvaDepartamento>(
      clave,
      "presencia_eva",
      TTL_DIAS,
      this.memoria,
      undefined,
      () => this.cargarEvaDepartamento(clave, departamento),
      NEGATIVA_MS,
    );
  }

  /** Archivo de caché primero; si no hay, consulta los dos conjuntos de EVA (agrupado) y guarda el resultado. */
  private async cargarEvaDepartamento(clave: string, departamento: string): Promise<Result<EvaDepartamento, DomainError>> {
    const guardado = await this.cacheArchivo.leer<EvaDepartamento>(clave);
    if (guardado?.municipios && guardado.anioMax) return Result.ok(guardado);

    const dep = Number(departamento.replace(/[^0-9]/g, ""));
    if (!Number.isInteger(dep) || dep <= 0) return Result.err(new PresenciaLocalNoDisponibleError("EVA (datos.gov.co)", "departamento inválido"));
    try {
      const [reciente, historico] = await Promise.all([
        // uejq-wxrr guarda el código como texto ("05001"); 2pnw-mmge como número (5001): se filtra por rango.
        this.consultarEva(URL_EVA_RECIENTE, "c_digo_dane_municipio", "rea_sembrada", "starts_with(c_digo_dane_municipio,'" + departamento + "')"),
        this.consultarEva(URL_EVA_HISTORICO, "c_d_mun", "rea_sembrada_ha", "c_d_mun between " + dep * 1000 + " and " + (dep * 1000 + 999)),
      ]);
      const municipios: Record<string, Record<string, number>> = {};
      let anioMax = ANIO_INICIO_EVA;
      for (const f of [...reciente, ...historico]) {
        anioMax = Math.max(anioMax, f.anioMax);
        const c = claveDesdeNombreEva(f.cultivo);
        if (!c) continue;
        const codigo = f.municipio.padStart(5, "0");
        const m = municipios[codigo] ?? (municipios[codigo] = {});
        m[c] = Math.round(((m[c] ?? 0) + f.ha) * 100) / 100;
      }
      const valor: EvaDepartamento = { departamento, anioMax, municipios };
      await this.cacheArchivo.escribir(clave, valor);
      return Result.ok(valor);
    } catch (error) {
      return Result.err(new PresenciaLocalNoDisponibleError("EVA (datos.gov.co)", describirError(error, EVA_TIMEOUT_MS)));
    }
  }

  /** Una consulta Socrata agrupada por municipio y cultivo: hectáreas sumadas desde 2015 y año máximo. Lanza si falla. */
  private async consultarEva(
    base: string,
    campoMunicipio: string,
    campoArea: string,
    filtroDepartamento: string,
  ): Promise<{ municipio: string; cultivo: string; ha: number; anioMax: number }[]> {
    const url = new URL(base);
    url.searchParams.set("$select", campoMunicipio + " as mun,cultivo,sum(" + campoArea + ") as ha,max(a_o) as maxa");
    url.searchParams.set("$where", filtroDepartamento + " AND a_o >= '" + ANIO_INICIO_EVA + "'");
    url.searchParams.set("$group", campoMunicipio + ",cultivo");
    url.searchParams.set("$limit", "50000");
    const r = await fetchConReintentos(url, {
      headers: { Accept: "application/json" },
      timeoutMs: EVA_TIMEOUT_MS,
      reintentos: 1,
      esperaInicialMs: 1_000,
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error("HTTP " + r.status);
    }
    const filas = await r.json() as { mun?: string; cultivo?: string; ha?: string; maxa?: string }[];
    if (!Array.isArray(filas)) throw new Error("respuesta inesperada");
    return filas
      .filter((f) => typeof f.cultivo === "string" && f.mun !== undefined)
      .map((f) => ({ municipio: String(f.mun), cultivo: f.cultivo!, ha: Number(f.ha) || 0, anioMax: Number(f.maxa) || 0 }));
  }
}
