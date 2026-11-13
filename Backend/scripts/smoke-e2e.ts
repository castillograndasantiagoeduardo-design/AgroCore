/**
 * Prueba de extremo a extremo (smoke) contra la API REAL corriendo (http://localhost:PORT), flujo v2 SIN fincas.
 *
 * Uso (desde Backend/, con la API encendida):  deno run -A --env-file=../.env scripts/smoke-e2e.ts
 *
 * Para cada lugar llama a POST /api/recomendacion/rapida y POST /api/recomendacion/detalle y valida con Zod:
 *   Lugares aptos (Duitama, Iowa, Kenia, Andalucía):
 *     - aptitud "apto" y épocas del año con qué sembrar para LOS 4 OBJETIVOS (una recomendación por época, con
 *       "qué sembrar", "por qué", "cuidado" y fuentes);
 *     - toda cifra de la respuesta como DatoConFuente;
 *     - 3 o más estrategias distintas y completas (por qué, evidencia, beneficios, vacíos de información y riesgos);
 *     - la condición propia del lugar (presencia EVA en Duitama, invierno en Iowa, dos épocas de lluvias en Kenia,
 *       verano seco en Andalucía).
 *   Autopista: un punto sobre la calzada de la doble calzada "Vía Paipa - Duitama" (troncal BTS, highway=trunk),
 *     verificado con OpenStreetMap (Overpass en vivo o, si no responde, los datos de Overpass del precálculo regional):
 *     debe decir "No se puede sembrar: es carretera" y no dar cultivos ni rotaciones.
 *
 * Termina con código 0 solo si los 5 lugares pasan.
 */
import mysql from "mysql2/promise";
import {
  MENSAJE_ES_CARRETERA,
  OBJETIVOS,
  RecomendacionDetalleSchema,
  type RecomendacionDetalleDto,
  RecomendacionRapidaSchema,
  type RecomendacionRapidaDto,
} from "@agrocore/contracts";

const API = "http://localhost:" + (Deno.env.get("PORT") ?? "8001") + "/api";
const TIMEOUT_MS = 5 * 60_000;

type Respuesta<T> = { status: number; cuerpo: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }; ms: number };

async function post<T>(ruta: string, body: unknown): Promise<Respuesta<T>> {
  const inicio = performance.now();
  const r = await fetch(API + ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: r.status, cuerpo: await r.json(), ms: performance.now() - inicio };
}

/** Rutas de números que NO vienen dentro de un DatoConFuente (estructurales permitidos: meses, orden, geometría, ubicación). */
const ESTRUCTURALES = new Set(["mes", "meses", "orden", "anio", "mesSiembra", "mesCosecha", "mesesCiclo", "mesesBaldios", "indice", "geometria", "latitud", "longitud", "areaHa"]);
function cifrasSinFuente(x: unknown, ruta = "$"): string[] {
  if (typeof x === "number") return [ruta];
  if (Array.isArray(x)) return x.flatMap((v, i) => cifrasSinFuente(v, ruta + "[" + i + "]"));
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if ("valor" in o && "fuente" in o && "tipo" in o) return [];
    return Object.entries(o).flatMap(([k, v]) => (ESTRUCTURALES.has(k) ? [] : cifrasSinFuente(v, ruta + "." + k)));
  }
  return [];
}

interface Resultado {
  lugar: string;
  pasa: boolean;
  detalle: string[];
}
const resultados: Resultado[] = [];

function verificarRapida(r: RecomendacionRapidaDto, errores: string[]): void {
  if (r.aptitud.estado !== "apto") errores.push("aptitud " + r.aptitud.estado + " (" + r.aptitud.mensaje + ")");
  if (r.epocas.length === 0) errores.push("sin épocas");
  for (const o of OBJETIVOS) {
    const recs = r.recomendaciones[o];
    if (recs.length !== r.epocas.length) errores.push(o + ": " + recs.length + " recomendaciones para " + r.epocas.length + " épocas");
    for (const rec of recs) {
      if (!rec.queSembrar || !rec.porQue || !rec.cuidado || rec.fuentes.length === 0) errores.push(o + "/" + rec.epocaId + ": recomendación incompleta");
    }
    if (!recs.some((x) => x.accion === "sembrar")) errores.push(o + ": ninguna época con cultivo");
  }
  const sinFuente = cifrasSinFuente(r);
  if (sinFuente.length) errores.push("cifras sin fuente: " + sinFuente.slice(0, 3).join(", "));
}

function verificarDetalle(d: RecomendacionDetalleDto, errores: string[]): void {
  if (d.estrategias.length < 3) errores.push("solo " + d.estrategias.length + " estrategias (" + (d.errorEstrategias?.message ?? "") + ")");
  const claves = d.estrategias.map((e) => e.secuencia.map((p) => p.cultivoClave).join(","));
  if (new Set(claves).size !== claves.length) errores.push("hay estrategias repetidas");
  for (const e of d.estrategias) {
    for (const campo of ["porQue", "evidencia", "beneficios", "vaciosInformacion", "riesgos"] as const) {
      const v = e[campo];
      if (!v || (Array.isArray(v) && v.length === 0)) errores.push(e.id + ": " + campo + " vacío");
    }
  }
  if (d.climaMensual.length !== 12) errores.push("clima mes a mes incompleto");
  const sinFuente = cifrasSinFuente(d);
  if (sinFuente.length) errores.push("cifras sin fuente en el detalle: " + sinFuente.slice(0, 3).join(", "));
}

const resumenEpocas = (r: RecomendacionRapidaDto) =>
  r.epocas.map((e) => {
    const rec = r.recomendaciones.equilibrado.find((x) => x.epocaId === e.id);
    return e.nombre + ": " + (rec?.cultivo?.clave ?? "descansar");
  }).join(" · ");

async function lugarApto(
  lugar: string,
  latitud: number,
  longitud: number,
  cultivoActual: string,
  condicion: (r: RecomendacionRapidaDto, d: RecomendacionDetalleDto) => string | null,
): Promise<void> {
  const errores: string[] = [];
  const detalle: string[] = [];
  const entrada = { area: { tipo: "punto", latitud, longitud }, cultivoActual, tieneRiego: false, objetivo: "equilibrado" };
  const [rR, rD] = await Promise.all([post<RecomendacionRapidaDto>("/recomendacion/rapida", entrada), post<RecomendacionDetalleDto>("/recomendacion/detalle", entrada)]);
  if (!rR.cuerpo.ok) errores.push("rápida → HTTP " + rR.status + " " + rR.cuerpo.error.code + ": " + rR.cuerpo.error.message);
  if (!rD.cuerpo.ok) errores.push("detalle → HTTP " + rD.status + " " + rD.cuerpo.error.code + ": " + rD.cuerpo.error.message);
  if (rR.cuerpo.ok && rD.cuerpo.ok) {
    const pr = RecomendacionRapidaSchema.safeParse(rR.cuerpo.data);
    const pd = RecomendacionDetalleSchema.safeParse(rD.cuerpo.data);
    if (!pr.success) errores.push("la rápida no cumple el contrato: " + pr.error.issues[0]?.path.join(".") + " " + pr.error.issues[0]?.message);
    if (!pd.success) errores.push("el detalle no cumple el contrato: " + pd.error.issues[0]?.path.join(".") + " " + pd.error.issues[0]?.message);
    if (pr.success && pd.success) {
      const r = pr.data;
      const d = pd.data;
      verificarRapida(r, errores);
      verificarDetalle(d, errores);
      const c = condicion(r, d);
      if (c) errores.push(c);
      detalle.push("aptitud " + r.aptitud.estado + " · clima " + r.resumenClima.origen + " · origen " + r.origen + " · presencia " + (r.presenciaLocal ? r.presenciaLocal.fuente + " (" + r.presenciaLocal.ambito + ")" : "sin datos"));
      detalle.push("épocas (equilibrado): " + resumenEpocas(r));
      detalle.push("estrategias: " + d.estrategias.map((e) => e.id + " " + e.secuencia.map((p) => p.cultivoClave).join("→")).join(" | "));
      detalle.push("rápida " + (rR.ms / 1000).toFixed(1) + " s · detalle " + (rD.ms / 1000).toFixed(1) + " s");
      for (const a of r.advertencias.filter((x) => /OpenStreetMap|no respondió/.test(x))) detalle.push("⚠ " + a);
    }
  }
  resultados.push({ lugar, pasa: errores.length === 0, detalle: [...errores.map((e) => "✗ " + e), ...detalle] });
}

// ─────────────────────────── Autopista: punto sobre la calzada verificado con OpenStreetMap ───────────────────────────

const ESPEJOS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass-api.de/api/interpreter"];
/** Caja alrededor de la doble calzada Paipa–Duitama (troncal BTS), dentro del bloque precalculado 5,7–5,8 / −73,1–−73,0. */
const CAJA = { sur: 5.78, oeste: -73.095, norte: 5.795, este: -73.06 };

type Geometria = [number, number][];
function puntoMedio(g: Geometria): [number, number] {
  // Punto medio del segmento más largo: queda exactamente sobre el eje de la vía.
  let mejor = 0;
  let largo = -1;
  for (let i = 0; i < g.length - 1; i++) {
    const d = Math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]);
    if (d > largo) {
      largo = d;
      mejor = i;
    }
  }
  return [(g[mejor][0] + g[mejor + 1][0]) / 2, (g[mejor][1] + g[mejor + 1][1]) / 2];
}

async function viaDesdeOverpass(): Promise<{ g: Geometria; origen: string } | null> {
  const q = '[out:json][timeout:50];way["highway"~"^(motorway|trunk)$"]["name"="Vía Paipa - Duitama"](' + [CAJA.sur, CAJA.oeste, CAJA.norte, CAJA.este].join(",") + ");out geom;";
  for (const url of ESPEJOS) {
    try {
      const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) continue;
      const j = await r.json() as { elements: { id: number; geometry: { lat: number; lon: number }[] }[] };
      const w = j.elements.sort((a, b) => b.geometry.length - a.geometry.length)[0];
      if (w) return { g: w.geometry.map((p) => [p.lat, p.lon]), origen: "Overpass en vivo (" + new URL(url).host + "), way " + w.id };
    } catch { /* siguiente espejo */ }
  }
  return null;
}

async function viaDesdePrecalculo(): Promise<{ g: Geometria; origen: string } | null> {
  const c = await mysql.createConnection({
    host: Deno.env.get("DB_HOST"),
    port: Number(Deno.env.get("DB_PORT")),
    user: Deno.env.get("DB_USER"),
    password: Deno.env.get("DB_PASSWORD") ?? "",
    database: Deno.env.get("DB_NAME"),
  });
  try {
    const [filas] = await c.query(
      "SELECT osm_id, ST_AsText(geom, 'axis-order=long-lat') AS wkt FROM vias_region WHERE tipo IN ('motorway','trunk') AND nombre = 'Vía Paipa - Duitama' " +
        "AND MBRIntersects(geom, ST_GeomFromText(?, 4326, 'axis-order=long-lat')) ORDER BY ST_NumPoints(geom) DESC LIMIT 1",
      ["POLYGON((" + [[CAJA.oeste, CAJA.sur], [CAJA.este, CAJA.sur], [CAJA.este, CAJA.norte], [CAJA.oeste, CAJA.norte], [CAJA.oeste, CAJA.sur]].map((p) => p.join(" ")).join(",") + "))"],
    );
    const f = (filas as { osm_id: number; wkt: string }[])[0];
    if (!f) return null;
    const g = f.wkt.replace(/^LINESTRING\(|\)$/g, "").split(",").map((p) => p.trim().split(" ").map(Number)).map(([lon, lat]) => [lat, lon] as [number, number]);
    return { g, origen: "OpenStreetMap del precálculo regional (descargado de Overpass), way " + f.osm_id };
  } finally {
    await c.end();
  }
}

async function autopista(): Promise<void> {
  const errores: string[] = [];
  const detalle: string[] = [];
  const via = (await viaDesdeOverpass()) ?? (await viaDesdePrecalculo());
  if (!via) {
    resultados.push({ lugar: "Autopista (doble calzada Paipa–Duitama)", pasa: false, detalle: ["✗ no se pudo verificar la vía en OpenStreetMap"] });
    return;
  }
  const [lat, lon] = puntoMedio(via.g);
  detalle.push("punto (" + lat.toFixed(6) + ", " + lon.toFixed(6) + ") sobre el eje · " + via.origen);
  const entrada = { area: { tipo: "punto", latitud: lat, longitud: lon }, cultivoActual: "papa", tieneRiego: false, objetivo: "equilibrado" };
  const [rR, rD] = await Promise.all([post<RecomendacionRapidaDto>("/recomendacion/rapida", entrada), post<RecomendacionDetalleDto>("/recomendacion/detalle", entrada)]);
  if (!rR.cuerpo.ok) errores.push("rápida → " + rR.cuerpo.error.code + ": " + rR.cuerpo.error.message);
  else {
    const r = rR.cuerpo.data;
    if (r.aptitud.mensaje !== MENSAJE_ES_CARRETERA) errores.push("mensaje: " + r.aptitud.mensaje);
    if (r.aptitud.estado !== "no_apto_carretera") errores.push("aptitud " + r.aptitud.estado);
    if (r.aptitud.viasCercanas.length === 0) errores.push("no devolvió la vía para resaltarla");
    if (OBJETIVOS.some((o) => r.recomendaciones[o].length > 0)) errores.push("recomendó cultivos sobre la carretera");
    detalle.push("rápida: \"" + r.aptitud.mensaje + "\" · " + (rR.ms / 1000).toFixed(1) + " s · origen " + r.origen);
  }
  if (!rD.cuerpo.ok) errores.push("detalle → " + rD.cuerpo.error.code);
  else {
    const d = rD.cuerpo.data;
    if (d.estrategias.length > 0) errores.push("el detalle devolvió rotaciones sobre la carretera");
    if (d.errorEstrategias?.code !== "TERRENO_NO_APTO") errores.push("detalle: se esperaba TERRENO_NO_APTO y llegó " + (d.errorEstrategias?.code ?? "ninguno"));
    detalle.push("detalle: " + (d.errorEstrategias?.code ?? "") + " · sin rotaciones");
  }
  resultados.push({ lugar: "Autopista (doble calzada Paipa–Duitama)", pasa: errores.length === 0, detalle: [...errores.map((e) => "✗ " + e), ...detalle] });
}

// ─────────────────────────── Ejecución ───────────────────────────

console.log("API en " + API + " · 5 lugares (rápida + detalle)…\n");

await lugarApto("Duitama, Boyacá (lote rural 5.785, −73.030; papa continua)", 5.785, -73.03, "papa", (r) => {
  if (r.presenciaLocal?.fuente !== "EVA") return "se esperaba presencia local de EVA";
  for (const o of OBJETIVOS) {
    for (const rec of r.recomendaciones[o]) {
      if (rec.accion === "sembrar" && rec.cultivo?.presenciaLocal !== "local") return o + ": primera recomendación sin presencia local (" + rec.cultivo?.clave + ")";
      if (rec.cultivo?.clave === "centeno") return "el centeno salió como primera recomendación";
    }
  }
  return null;
});
await lugarApto("Ames, Iowa, EE. UU. (campo 42.008, −93.700)", 42.008, -93.7, "maiz", (r) =>
  r.epocas.some((e) => (e.tipo === "invierno" || e.tipo === "heladas") && e.meses.includes(1)) ? null : "se esperaba invierno o heladas en enero");
await lugarApto("Nakuru, Kenia (campo de Lanet −0.270, 36.150)", -0.27, 36.15, "maiz", (r) =>
  r.epocas.filter((e) => e.tipo === "lluviosa").length >= 2 ? null : "se esperaban dos épocas de lluvias (régimen bimodal)");
await lugarApto("Córdoba, Andalucía, España (campo 37.850, −4.850)", 37.85, -4.85, "trigo", (r) =>
  r.epocas.some((e) => (e.tipo === "seca" || e.tipo === "calor") && e.meses.includes(7)) ? null : "se esperaba verano seco o caluroso en julio");
await autopista();

console.log("=".repeat(100));
for (const r of resultados) {
  console.log((r.pasa ? "PASS" : "FAIL") + " · " + r.lugar);
  for (const d of r.detalle) console.log("       " + d);
}
console.log("=".repeat(100));
const pasan = resultados.filter((r) => r.pasa).length;
console.log("Resultado: " + pasan + "/" + resultados.length + " lugares PASS");
Deno.exit(pasan === resultados.length ? 0 : 1);
