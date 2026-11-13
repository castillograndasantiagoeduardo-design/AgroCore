/**
 * Prueba de extremo a extremo (smoke) contra la API REAL corriendo (http://localhost:PORT).
 *
 * Uso (desde Backend/, con la API encendida):  deno run -A --env-file=../.env scripts/smoke-e2e.ts
 *
 * Para cada lugar llama a POST /api/terreno/analizar y POST /api/rotaciones/comparar y valida con Zod:
 *   - aptitud esperada;
 *   - meses baldíos, calendario de vulnerabilidad (12 meses) y oportunidades presentes;
 *   - 3 o más estrategias DISTINTAS, incluida la actual (A), cada una con porQue, evidencia, beneficios,
 *     vaciosInformacion y riesgos no vacíos;
 *   - la condición propia del lugar (IDEAM calibrado, temporada + invierno, bimodal, déficit de verano).
 * La autopista se busca en el propio Overpass (un punto sobre el eje de una autovía real): debe responder
 * "No se puede sembrar: es carretera" y la comparación debe fallar con TERRENO_NO_APTO (sin rotaciones).
 *
 * Los lugares "campo" son lotes agrícolas verificados con MODIS (MCD12Q1) y OpenStreetMap. Las coordenadas
 * literales del plan para Duitama (5.8269, -73.0297: casco urbano, sobre la Carrera 19) y Nakuru
 * (-0.3031, 36.0800: centro de la ciudad) se reportan como casos INFORMATIVOS.
 *
 * Termina con código 0 solo si TODO pasa.
 */
import {
  ComparacionRotacionesSchema,
  type ComparacionRotacionesDto,
  MENSAJE_ES_CARRETERA,
  PerfilTerrenoSchema,
  type PerfilTerrenoDto,
} from "@agrocore/contracts";

const API = "http://localhost:" + (Deno.env.get("PORT") ?? "8001") + "/api";
const TIMEOUT_MS = 15 * 60_000;
const PRIORIDADES = { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 };

type Respuesta<T> = { status: number; cuerpo: { ok: true; data: T } | { ok: false; error: { code: string; message: string } } };

async function post<T>(ruta: string, body: unknown): Promise<Respuesta<T>> {
  const r = await fetch(API + ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: r.status, cuerpo: await r.json() };
}

interface Resultado {
  lugar: string;
  pasa: boolean;
  informativo?: boolean;
  detalle: string[];
}

const resultados: Resultado[] = [];

function verificarEstrategias(c: ComparacionRotacionesDto, errores: string[]): void {
  if (c.estrategias.length < 3) errores.push("solo " + c.estrategias.length + " estrategias");
  if (c.estrategias[0]?.id !== "A") errores.push("falta la estrategia actual A");
  const claves = c.estrategias.map((e) => e.secuencia.map((p) => p.cultivoClave).join(","));
  if (new Set(claves).size !== claves.length) errores.push("hay estrategias repetidas");
  for (const e of c.estrategias) {
    for (const campo of ["porQue", "evidencia", "beneficios", "vaciosInformacion", "riesgos"] as const) {
      const v = e[campo];
      if (!v || (Array.isArray(v) && v.length === 0)) errores.push(e.id + ": " + campo + " vacío");
    }
  }
  if (!Array.isArray(c.terreno.mesesBaldios)) errores.push("faltan los meses baldíos");
  if (c.calendario.length !== 12 || c.calendario.some((m) => !m.vulnerabilidad)) errores.push("calendario de vulnerabilidad incompleto");
  if (c.oportunidades.length === 0) errores.push("sin oportunidades");
}

async function lugarApto(
  lugar: string,
  latitud: number,
  longitud: number,
  cultivoActual: string,
  condicion: (c: ComparacionRotacionesDto, t: PerfilTerrenoDto) => string | null,
): Promise<void> {
  const inicio = performance.now();
  const errores: string[] = [];
  const detalle: string[] = [];
  const area = { tipo: "punto", latitud, longitud };

  const t = await post<PerfilTerrenoDto>("/terreno/analizar", { area });
  if (!t.cuerpo.ok) {
    resultados.push({ lugar, pasa: false, detalle: ["terreno → HTTP " + t.status + " " + t.cuerpo.error.code + ": " + t.cuerpo.error.message] });
    return;
  }
  const terreno = PerfilTerrenoSchema.parse(t.cuerpo.data);
  if (terreno.aptitud !== "apto") errores.push("aptitud " + terreno.aptitud + " (" + terreno.mensajeAptitud + ")");
  if (!terreno.fuentes.some((f) => f.includes("OpenStreetMap"))) detalle.push("⚠ OpenStreetMap no respondió: aptitud sin verificar vías");
  if (!terreno.ndvi) detalle.push("⚠ NDVI MODIS no respondió (degradado con vacío de información)");

  const c = await post<ComparacionRotacionesDto>("/rotaciones/comparar", { area, cultivoActual, tieneRiego: false, prioridades: PRIORIDADES });
  if (!c.cuerpo.ok) {
    resultados.push({ lugar, pasa: false, detalle: [...errores, "comparar → HTTP " + c.status + " " + c.cuerpo.error.code + ": " + c.cuerpo.error.message] });
    return;
  }
  const comp = ComparacionRotacionesSchema.parse(c.cuerpo.data);
  verificarEstrategias(comp, errores);
  const fallaCondicion = condicion(comp, terreno);
  if (fallaCondicion) errores.push(fallaCondicion);

  detalle.unshift(
    "aptitud " + terreno.aptitud + " · " + comp.clima.fuente + " · " + comp.clima.regimenLluvias + " · ventanas " +
      comp.ventanas.map((v) => v.nombre).join(" + ") + " · baldíos " + JSON.stringify(comp.terreno.mesesBaldios),
    comp.estrategias.map((e) => e.id + ": " + e.secuencia.map((p) => (p.continua ? "↳" : "") + p.cultivoClave).join("→") + " (" + e.puntajeTotal + ")").join(" | "),
    comp.oportunidades.length + " oportunidades · " + Math.round((performance.now() - inicio) / 1000) + " s",
  );
  resultados.push({ lugar, pasa: errores.length === 0, detalle: [...errores.map((e) => "✗ " + e), ...detalle] });
}

/** Busca en Overpass un tramo real de autovía y devuelve un punto sobre su eje (punto medio de un segmento). */
async function puntoSobreAutopista(): Promise<{ latitud: number; longitud: number; nombre: string } | null> {
  const consulta = '[out:json][timeout:25];way["highway"="motorway"](around:4000,37.87,-4.75);out geom 3;';
  const espejos = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  for (let ronda = 0; ronda < 4; ronda++) {
    for (const espejo of espejos) {
      try {
        const r = await fetch(espejo, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "AgroCore/0.2 (smoke-e2e)" },
          body: "data=" + encodeURIComponent(consulta),
          signal: AbortSignal.timeout(30_000),
        });
        if (!r.ok) continue;
        const json = await r.json() as { elements?: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] };
        const via = json.elements?.find((e) => (e.geometry?.length ?? 0) >= 2);
        if (!via?.geometry) continue;
        const [a, b] = via.geometry;
        return { latitud: (a.lat + b.lat) / 2, longitud: (a.lon + b.lon) / 2, nombre: via.tags?.ref ?? via.tags?.name ?? "autovía" };
      } catch {
        // siguiente espejo
      }
    }
    await new Promise((r) => setTimeout(r, 3000 * (ronda + 1)));
  }
  return null;
}

async function lugarCarretera(lugar: string, punto: { latitud: number; longitud: number } | null, informativo = false): Promise<void> {
  if (!punto) {
    resultados.push({ lugar, pasa: false, informativo, detalle: ["✗ Overpass no respondió: no se pudo obtener un punto sobre la autopista"] });
    return;
  }
  const area = { tipo: "punto", latitud: punto.latitud, longitud: punto.longitud };
  const errores: string[] = [];
  const t = await post<PerfilTerrenoDto>("/terreno/analizar", { area });
  let mensaje = "";
  if (!t.cuerpo.ok) errores.push("terreno → " + t.cuerpo.error.code);
  else {
    const terreno = PerfilTerrenoSchema.parse(t.cuerpo.data);
    mensaje = terreno.mensajeAptitud;
    if (terreno.aptitud !== "no_apto_carretera") errores.push("aptitud " + terreno.aptitud + " (" + terreno.mensajeAptitud + ")");
    if (terreno.mensajeAptitud !== MENSAJE_ES_CARRETERA) errores.push("mensaje distinto: " + terreno.mensajeAptitud);
    if (!terreno.viasCercanas.length) errores.push("no devolvió la vía para resaltarla");
  }
  const c = await post<unknown>("/rotaciones/comparar", { area, cultivoActual: "trigo", prioridades: PRIORIDADES });
  if (c.cuerpo.ok) errores.push("la comparación devolvió rotaciones sobre la carretera");
  else if (c.cuerpo.error.code !== "TERRENO_NO_APTO" || c.cuerpo.error.message !== MENSAJE_ES_CARRETERA) {
    errores.push("comparar → " + c.cuerpo.error.code + ": " + c.cuerpo.error.message);
  }
  resultados.push({
    lugar,
    pasa: errores.length === 0,
    informativo,
    detalle: [
      ...errores.map((e) => "✗ " + e),
      "punto (" + punto.latitud.toFixed(6) + ", " + punto.longitud.toFixed(6) + ") → \"" + mensaje + "\"; comparar → HTTP " + c.status +
        (c.cuerpo.ok ? "" : " " + c.cuerpo.error.code + " \"" + c.cuerpo.error.message + "\"") + " (sin rotaciones)",
    ],
  });
}

// ---------------------------------------------------------------------------
const salud = await fetch(API + "/health").then((r) => r.ok).catch(() => false);
if (!salud) {
  console.error("❌ La API no responde en " + API + "/health. Enciéndela: cd Backend/apps/api && deno task start");
  Deno.exit(1);
}
console.log("API en " + API + " · ejecutando los 5 lugares (la primera vez cada lugar tarda 1–3 min por los proveedores externos)…\n");

await lugarApto("Duitama, Colombia (lote rural 5.785, -73.030)", 5.785, -73.03, "papa", (c) =>
  !c.clima.calibrado ? "no quedó calibrado con IDEAM" : null);
await lugarApto("Ames, Iowa, EE. UU. (campo 42.008, -93.700)", 42.008, -93.7, "maiz", (c) =>
  c.ventanas.length === 2 && c.ventanas[0].tipo === "temporada" && c.ventanas[1].tipo === "intervalo" && c.ventanas[1].meses.includes(1)
    ? null
    : "no salió temporada única + invierno (" + c.ventanas.map((v) => v.nombre).join(", ") + ")");
await lugarApto("Nakuru, Kenia (campo de Lanet -0.270, 36.150)", -0.27, 36.15, "maiz", (c) =>
  c.clima.regimenLluvias === "bimodal" && c.temporadas.length === 2 ? null : "no salió bimodal (" + c.clima.regimenLluvias + ")");
await lugarApto("Córdoba, Andalucía, España (campo 37.850, -4.850)", 37.85, -4.85, "trigo", (c) =>
  [6, 7, 8].every((m) => c.clima.mesesDeficitHidrico.includes(m)) ? null : "sin déficit hídrico de verano (" + JSON.stringify(c.clima.mesesDeficitHidrico) + ")");
const autopista = await puntoSobreAutopista();
await lugarCarretera("Autopista (" + (autopista?.nombre ?? "?") + ", Córdoba, punto sobre la calzada vía Overpass)", autopista);

// Informativos: coordenadas literales del plan.
await lugarCarretera("[informativo] Coordenada del plan para Duitama (5.8269, -73.0297): casco urbano, Carrera 19", { latitud: 5.8269, longitud: -73.0297 }, true);

console.log("=".repeat(100));
for (const r of resultados) {
  console.log((r.informativo ? (r.pasa ? "INFO ✓" : "INFO ✗") : r.pasa ? "PASS" : "FAIL") + " · " + r.lugar);
  for (const d of r.detalle) console.log("       " + d);
}
const obligatorios = resultados.filter((r) => !r.informativo);
const pasan = obligatorios.filter((r) => r.pasa).length;
console.log("=".repeat(100));
console.log("Resultado: " + pasan + "/" + obligatorios.length + " lugares PASS");
Deno.exit(pasan === obligatorios.length ? 0 : 1);
