/**
 * Precálculo regional: deja en MySQL lo que la etapa rápida necesita para responder sin llamar a proveedores externos.
 *
 * Uso (desde Backend/):
 *   deno run -A --env-file=../.env scripts/precalcular-region.ts [--solo=clima|vias|cobertura|elevacion|presencia]
 *                                                               [--reintentar-errores] [--limite=N]
 *
 * Fases (en este orden):
 *   presencia  EVA del departamento de Boyacá (caché de archivos de platform).
 *   cobertura  MODIS MCD12Q1 (LC_Type1, último año) de la región "detalle", en bloques de 201 km del subset de ORNL.
 *   elevacion  SRTM en grilla de 0,01° de la región "detalle" (OpenTopoData: 100 puntos por petición, 1 por segundo).
 *   vias       vías, edificaciones y agua de la región "detalle" desde Overpass, en bloques de 0,1°.
 *   clima      serie diaria de 30 años por celda de NASA POWER de la región "clima" (concurrencia 3) y, para las celdas
 *              que tocan la región "detalle", la recomendación por época de referencia (VERSION_MOTOR).
 *
 * Regiones: REGION_PRECALCULO en .env (ver .env.example); por defecto clima = Colombia continental, detalle = Boyacá.
 *
 * Reanudable: cada bloque queda en precalculo_bloques (pendiente | listo | error). Una nueva ejecución solo repite lo
 * que no está "listo"; los bloques en "error" se saltan salvo con --reintentar-errores. Si cambia VERSION_MOTOR o el
 * año (cambia el periodo de 30 años), las celdas afectadas se recalculan.
 *
 * Opciones:
 *   --solo=<fase>          corre una sola fase.
 *   --reintentar-errores   vuelve a intentar también los bloques en "error".
 *   --limite=N             procesa como máximo N bloques por fase (pruebas).
 *
 * Termina con código 0 solo si todos los bloques de las fases corridas quedaron "listo". Nunca imprime .env.
 */
import { createContainer, loadConfigFromEnv } from "@agrocore/composition";
import { VERSION_MOTOR } from "@agrocore/core";
import {
  cajaDeBloqueVias,
  clavesBloquesVias,
  indiceElevacion,
  PASO_ELEVACION_GRADOS,
} from "@agrocore/database";
import {
  type CajaGeo,
  celdaPower,
  descargarBloqueOsm,
  descargarElevaciones,
  descargarSubsetCobertura,
  ultimaFechaCoberturaModis,
} from "@agrocore/platform";

// ---------- Argumentos ----------

const FASES = ["presencia", "cobertura", "elevacion", "vias", "clima"] as const;
type Fase = typeof FASES[number];

function leerArgumentos(): { solo: Fase | null; reintentarErrores: boolean; limite: number } {
  let solo: Fase | null = null;
  let reintentarErrores = false;
  let limite = Infinity;
  for (const a of Deno.args) {
    if (a.startsWith("--solo=")) {
      const v = a.slice(7) as Fase;
      if (!FASES.includes(v)) {
        console.error("❌ --solo debe ser uno de: " + FASES.join(", "));
        Deno.exit(2);
      }
      solo = v;
    } else if (a === "--reintentar-errores") reintentarErrores = true;
    else if (a.startsWith("--limite=")) {
      limite = Number(a.slice(9));
      if (!Number.isInteger(limite) || limite < 1) {
        console.error("❌ --limite debe ser un entero >= 1");
        Deno.exit(2);
      }
    } else {
      console.error("❌ Opción desconocida: " + a);
      Deno.exit(2);
    }
  }
  return { solo, reintentarErrores, limite };
}

const { solo, reintentarErrores, limite } = leerArgumentos();
const contenedor = createContainer(loadConfigFromEnv());
const { region, repositorio } = contenedor.precalculo;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const t0 = Date.now();
const hace = () => Math.round((Date.now() - t0) / 1000) + " s";
const mensajeError = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 280);

/** Resultado de una fase: cuántas claves esperadas hay y cuántas quedaron "listo". */
interface ResumenFase {
  fase: string;
  esperadas: number;
  listas: number;
  procesadas: number;
  errores: number;
}
const resumenes: ResumenFase[] = [];

async function pool<T>(items: readonly T[], concurrencia: number, tarea: (item: T) => Promise<void>): Promise<void> {
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(concurrencia, items.length) }, async () => {
    while (siguiente < items.length) await tarea(items[siguiente++]);
  });
  await Promise.all(trabajadores);
}

/** Aplica "listo / error / reintentar / límite" y devuelve las claves a procesar. */
function elegirPendientes(
  claves: readonly string[],
  estados: Map<string, { estado: string; intentos: number }>,
  esListo: (clave: string) => boolean,
): string[] {
  const pendientes = claves.filter((c) => {
    if (esListo(c)) return false;
    const e = estados.get(c);
    return !(e?.estado === "error" && !reintentarErrores);
  });
  return pendientes.slice(0, limite);
}

// ---------- Presencia ----------

async function fasePresencia(): Promise<void> {
  const claves = ["15"]; // Boyacá (código DANE)
  let listas = 0;
  let errores = 0;
  for (const dep of claves) {
    const inicio = Date.now();
    const r = await contenedor.precalculo.presencia.evaDepartamento(dep);
    if (r.ok) {
      const nMun = Object.keys(r.value.municipios).length;
      await repositorio.marcarBloque("presencia", dep, "listo", nMun + " municipios, hasta " + r.value.anioMax);
      console.log("  presencia EVA departamento " + dep + ": " + nMun + " municipios, año máximo " + r.value.anioMax + " (" + (Date.now() - inicio) + " ms)");
      listas++;
    } else {
      await repositorio.marcarBloque("presencia", dep, "error", r.error.message);
      console.log("  ❌ presencia " + dep + ": " + r.error.message);
      errores++;
    }
  }
  resumenes.push({ fase: "presencia", esperadas: claves.length, listas, procesadas: claves.length, errores });
}

// ---------- Cobertura ----------

/** Centros de los bloques de 201 km que cubren la caja "detalle" (con ~10 % de traslape). */
function centrosCobertura(caja: CajaGeo): { lat: number; lon: number }[] {
  const [s, o, n, e] = caja;
  const latMedia = (s + n) / 2;
  const pasoMaxKm = 180;
  const altoKm = (n - s) * 111.2;
  const anchoKm = (e - o) * 111.32 * Math.cos((latMedia * Math.PI) / 180);
  const filas = Math.max(1, Math.ceil(altoKm / pasoMaxKm));
  const columnas = Math.max(1, Math.ceil(anchoKm / pasoMaxKm));
  const centros: { lat: number; lon: number }[] = [];
  for (let a = 0; a < filas; a++) {
    for (let b = 0; b < columnas; b++) {
      centros.push({
        lat: Math.round((s + ((a + 0.5) * (n - s)) / filas) * 1000) / 1000,
        lon: Math.round((o + ((b + 0.5) * (e - o)) / columnas) * 1000) / 1000,
      });
    }
  }
  return centros;
}

async function faseCobertura(): Promise<void> {
  const centros = centrosCobertura(region.detalle);
  const claves = centros.map((c) => c.lat + "," + c.lon);
  const estados = await repositorio.estadoBloques("cobertura");
  const pendientes = elegirPendientes(claves, estados, (c) => estados.get(c)?.estado === "listo");
  console.log("  cobertura: " + claves.length + " bloques de 201 km, " + pendientes.length + " por procesar");
  let errores = 0;
  let fecha = "";
  try {
    if (pendientes.length > 0) fecha = await ultimaFechaCoberturaModis();
  } catch (e) {
    console.log("  ❌ no se pudo consultar la fecha de MCD12Q1: " + mensajeError(e));
    pendientes.length = 0;
    errores++;
  }
  let n = 0;
  for (const clave of pendientes) {
    const [lat, lon] = clave.split(",").map(Number);
    n++;
    const inicio = Date.now();
    try {
      const b = await descargarSubsetCobertura(lat, lon, fecha);
      await repositorio.guardarCobertura({
        clave,
        ...b,
        fuente: "NASA MODIS MCD12Q1 v061 (IGBP, 500 m, ORNL DAAC)",
      });
      await repositorio.marcarBloque("cobertura", clave, "listo", b.nrows + "x" + b.ncols + " píxeles, año " + b.anio);
      console.log("  [" + n + "/" + pendientes.length + "] cobertura " + clave + " " + b.nrows + "x" + b.ncols + " año " + b.anio + " (" + Math.round((Date.now() - inicio) / 1000) + " s)");
    } catch (e) {
      errores++;
      await repositorio.marcarBloque("cobertura", clave, "error", mensajeError(e));
      console.log("  ❌ cobertura " + clave + ": " + mensajeError(e));
    }
    await dormir(2_000);
  }
  const despues = await repositorio.estadoBloques("cobertura");
  resumenes.push({
    fase: "cobertura",
    esperadas: claves.length,
    listas: claves.filter((c) => despues.get(c)?.estado === "listo").length,
    procesadas: pendientes.length,
    errores,
  });
}

// ---------- Elevación ----------

async function faseElevacion(): Promise<void> {
  const [s, o, n, e] = region.detalle;
  const i0 = indiceElevacion(s);
  const i1 = indiceElevacion(n);
  const j0 = indiceElevacion(o);
  const j1 = indiceElevacion(e);
  const columnas = j1 - j0 + 1;
  const filas = i1 - i0 + 1;
  const peticiones = filas * Math.ceil(columnas / 100);
  console.log(
    "  elevación: grilla de " + PASO_ELEVACION_GRADOS + "° = " + filas + " filas x " + columnas + " columnas = " + filas * columnas +
      " puntos, " + peticiones + " peticiones (límite público: 1000 por día)",
  );
  if (peticiones > 1000) console.log("  ⚠️  la grilla pide más de 1000 peticiones: se completará en varios días (se reanuda sola).");
  const claves = Array.from({ length: filas }, (_, k) => String(i0 + k));
  const estados = await repositorio.estadoBloques("elevacion");
  const pendientes = elegirPendientes(claves, estados, (c) => estados.get(c)?.estado === "listo");
  console.log("  elevación: " + pendientes.length + " filas por procesar");
  let errores = 0;
  let n_ = 0;
  for (const clave of pendientes) {
    const i = Number(clave);
    n_++;
    const inicio = Date.now();
    try {
      const puntos: [number, number][] = [];
      for (let j = j0; j <= j1; j++) puntos.push([i * PASO_ELEVACION_GRADOS, j * PASO_ELEVACION_GRADOS]);
      const filasGuardar: { i: number; j: number; elevacionM: number }[] = [];
      for (let k = 0; k < puntos.length; k += 100) {
        const lote = puntos.slice(k, k + 100);
        const valores = await descargarElevaciones(lote);
        valores.forEach((v, idx) => {
          if (v !== null) filasGuardar.push({ i, j: j0 + k + idx, elevacionM: v });
        });
        await dormir(1_100); // 1 petición por segundo
      }
      await repositorio.guardarElevaciones(filasGuardar);
      await repositorio.marcarBloque("elevacion", clave, "listo", filasGuardar.length + " de " + puntos.length + " puntos con dato");
      if (n_ % 10 === 0 || n_ === pendientes.length) {
        console.log("  [" + n_ + "/" + pendientes.length + "] elevación fila " + clave + " (" + Math.round((Date.now() - inicio) / 1000) + " s, total " + hace() + ")");
      }
    } catch (err) {
      errores++;
      const m = mensajeError(err);
      await repositorio.marcarBloque("elevacion", clave, "error", m);
      console.log("  ❌ elevación fila " + clave + ": " + m);
      if (/HTTP 429|HTTP 403/.test(m)) {
        console.log("  ⛔ OpenTopoData rechazó por cuota: se detiene la fase. Vuelve a correrla mañana con --reintentar-errores.");
        break;
      }
    }
  }
  const despues = await repositorio.estadoBloques("elevacion");
  resumenes.push({
    fase: "elevacion",
    esperadas: claves.length,
    listas: claves.filter((c) => despues.get(c)?.estado === "listo").length,
    procesadas: pendientes.length,
    errores,
  });
}

// ---------- Vías, edificaciones y agua ----------

async function faseVias(): Promise<void> {
  const claves = clavesBloquesVias(region.detalle);
  const estados = await repositorio.estadoBloques("vias");
  const pendientes = elegirPendientes(claves, estados, (c) => estados.get(c)?.estado === "listo");
  console.log("  vías: " + claves.length + " bloques de 0,1°, " + pendientes.length + " por procesar");
  let errores = 0;
  let n = 0;
  for (const clave of pendientes) {
    n++;
    const inicio = Date.now();
    try {
      const bloque = await descargarBloqueOsm(cajaDeBloqueVias(clave));
      const vias = await repositorio.insertarVias(bloque.vias);
      const edificios = await repositorio.insertarEdificaciones(bloque.edificaciones);
      const agua = await repositorio.insertarAgua(bloque.agua);
      const omitidas = vias.omitidas + edificios.omitidas + agua.omitidas;
      await repositorio.marcarBloque(
        "vias",
        clave,
        "listo",
        bloque.vias.length + " vías, " + bloque.edificaciones.length + " edificaciones, " + bloque.agua.length + " agua" + (omitidas ? ", " + omitidas + " omitidas" : ""),
      );
      console.log(
        "  [" + n + "/" + pendientes.length + "] vías " + clave + ": " + bloque.vias.length + " vías, " + bloque.edificaciones.length + " edif., " +
          bloque.agua.length + " agua (" + Math.round((Date.now() - inicio) / 1000) + " s, total " + hace() + ")",
      );
    } catch (e) {
      errores++;
      await repositorio.marcarBloque("vias", clave, "error", mensajeError(e));
      console.log("  ❌ vías " + clave + ": " + mensajeError(e));
    }
    await dormir(1_500);
  }
  const despues = await repositorio.estadoBloques("vias");
  resumenes.push({
    fase: "vias",
    esperadas: claves.length,
    listas: claves.filter((c) => despues.get(c)?.estado === "listo").length,
    procesadas: pendientes.length,
    errores,
  });
}

// ---------- Clima ----------

const ANIOS_NORMAL = 30; // igual que ObtenerPerfilClimaticoUseCase

function periodoActual(): { desde: string; hasta: string } {
  const anioFin = new Date().getUTCFullYear() - 1;
  return { desde: anioFin - ANIOS_NORMAL + 1 + "-01-01", hasta: anioFin + "-12-31" };
}

/** Celdas de NASA POWER cuyo centro cae en la región "clima" o que tocan la región "detalle". */
function celdasRegion(): { i: number; j: number; latitud: number; longitud: number; enDetalle: boolean }[] {
  const celdas = new Map<string, { i: number; j: number; latitud: number; longitud: number; enDetalle: boolean }>();
  const recorrer = (caja: CajaGeo, criterio: "centro" | "toca") => {
    const [s, o, n, e] = caja;
    const a = celdaPower(s, o);
    const b = celdaPower(n, e);
    for (let i = a.i; i <= b.i; i++) {
      for (let j = a.j; j <= b.j; j++) {
        const latitud = Math.round((-90 + (i + 0.5) * 0.5) * 1e6) / 1e6;
        const longitud = Math.round((-180 + (j + 0.5) * 0.625) * 1e6) / 1e6;
        const dentro = latitud >= s && latitud <= n && longitud >= o && longitud <= e;
        if (criterio === "centro" && !dentro) continue;
        const previa = celdas.get(i + ":" + j);
        celdas.set(i + ":" + j, { i, j, latitud, longitud, enDetalle: criterio === "toca" || (previa?.enDetalle ?? false) });
      }
    }
  };
  recorrer(region.clima, "centro");
  recorrer(region.detalle, "toca");
  return [...celdas.values()];
}

async function faseClima(): Promise<void> {
  const celdas = celdasRegion();
  const { desde, hasta } = periodoActual();
  const guardadas = new Map((await repositorio.listarCeldas()).map((c) => [c.celdaI + ":" + c.celdaJ, c]));
  const estados = await repositorio.estadoBloques("clima");
  const claves = celdas.map((c) => c.i + ":" + c.j);
  const esListo = (clave: string) => {
    const g = guardadas.get(clave);
    return !!g && g.desde === desde && g.hasta === hasta;
  };
  // Primero las celdas de la región "detalle" (las que más importan), luego el resto de Colombia.
  const porClave0 = new Map(celdas.map((c) => [c.i + ":" + c.j, c]));
  const ordenadas = [...claves].sort((x, y) => Number(porClave0.get(y)!.enDetalle) - Number(porClave0.get(x)!.enDetalle));
  const pendientes = elegirPendientes(ordenadas, estados, esListo);
  console.log("  clima: " + claves.length + " celdas de NASA POWER (periodo " + desde + " a " + hasta + "), " + pendientes.length + " por descargar (concurrencia 3)");
  const porClave = new Map(celdas.map((c) => [c.i + ":" + c.j, c]));
  let errores = 0;
  let hechas = 0;
  await pool(pendientes, 3, async (clave) => {
    const c = porClave.get(clave)!;
    const inicio = Date.now();
    let ultimoError = "";
    for (let intento = 0; intento < 3; intento++) {
      // Cliente nuevo en cada intento: así no hereda la caché de errores en memoria del anterior.
      const r = await contenedor.precalculo.crearClimaVivo().obtenerSerieDiaria({ latitud: c.latitud, longitud: c.longitud, desde, hasta });
      if (r.ok) {
        const bytes = await repositorio.guardarCelda({ celdaI: c.i, celdaJ: c.j, latitud: c.latitud, longitud: c.longitud, serie: r.value, desde, hasta });
        await repositorio.marcarBloque("clima", clave, "listo", r.value.registros.length + " días, " + Math.round(bytes / 1024) + " KB gzip, altitud " + Math.round(r.value.altitudCeldaM) + " m");
        hechas++;
        console.log(
          "  [" + hechas + "/" + pendientes.length + "] clima celda " + clave + " (" + c.latitud + ", " + c.longitud + "): " + r.value.registros.length +
            " días, " + Math.round(bytes / 1024) + " KB (" + Math.round((Date.now() - inicio) / 1000) + " s, total " + hace() + ")",
        );
        return;
      }
      ultimoError = r.error.message;
      await dormir(5_000 * (intento + 1));
    }
    errores++;
    await repositorio.marcarBloque("clima", clave, "error", ultimoError);
    console.log("  ❌ clima celda " + clave + ": " + ultimoError);
  });

  // Recomendación de referencia de las celdas que tocan la región "detalle".
  await recomendacionesCeldas(porClave, desde, hasta);

  const despues = await repositorio.estadoBloques("clima");
  const celdasDespues = new Map((await repositorio.listarCeldas()).map((c) => [c.celdaI + ":" + c.celdaJ, c]));
  const listas = claves.filter((c) => {
    const g = celdasDespues.get(c);
    return !!g && g.desde === desde && g.hasta === hasta;
  }).length;
  const clavesRec = celdas.filter((c) => c.enDetalle).map((c) => "rec:" + c.i + ":" + c.j);
  const recListas = clavesRec.filter((c) => despues.get(c)?.estado === "listo").length;
  resumenes.push({ fase: "clima (series)", esperadas: claves.length, listas, procesadas: pendientes.length, errores });
  resumenes.push({
    fase: "clima (recomendación por celda)",
    esperadas: clavesRec.length,
    listas: recListas,
    procesadas: 0,
    errores: clavesRec.filter((c) => despues.get(c)?.estado === "error").length,
  });
}

async function recomendacionesCeldas(
  porClave: Map<string, { i: number; j: number; latitud: number; longitud: number; enDetalle: boolean }>,
  desde: string,
  hasta: string,
): Promise<void> {
  const guardadas = new Map((await repositorio.listarCeldas()).map((c) => [c.celdaI + ":" + c.celdaJ, c]));
  const estados = await repositorio.estadoBloques("clima");
  const claves = [...porClave.values()].filter((c) => c.enDetalle).map((c) => c.i + ":" + c.j);
  const pendientes = claves.filter((c) => {
    const g = guardadas.get(c);
    if (!g || g.desde !== desde || g.hasta !== hasta) return false; // sin serie no hay recomendación
    if (g.tieneRecomendacion && g.versionMotor === VERSION_MOTOR) return false;
    return !(estados.get("rec:" + c)?.estado === "error" && !reintentarErrores);
  }).slice(0, limite);
  console.log("  recomendación por celda (motor " + VERSION_MOTOR + "): " + claves.length + " celdas en la región detalle, " + pendientes.length + " por calcular");
  for (const clave of pendientes) {
    const c = porClave.get(clave)!;
    const inicio = Date.now();
    try {
      const r = await contenedor.recomendacionRapida.execute(
        { area: { tipo: "punto", latitud: c.latitud, longitud: c.longitud }, tieneRiego: false, objetivo: "equilibrado" },
        { origen: "script", ip: null },
      );
      if (!r.ok) throw new Error(r.error.message);
      const d = r.value;
      await repositorio.guardarRecomendacionCelda(
        c.i,
        c.j,
        { resumenClima: d.resumenClima, epocas: d.epocas, recomendaciones: d.recomendaciones, aptitud: d.aptitud, origen: d.origen, generadoEn: d.generadoEn },
        VERSION_MOTOR,
      );
      await repositorio.marcarBloque("clima", "rec:" + clave, "listo", d.epocas.length + " épocas");
      console.log("  recomendación celda " + clave + ": " + d.epocas.length + " épocas, origen " + d.origen + " (" + Math.round((Date.now() - inicio) / 1000) + " s)");
    } catch (e) {
      await repositorio.marcarBloque("clima", "rec:" + clave, "error", mensajeError(e));
      console.log("  ❌ recomendación celda " + clave + ": " + mensajeError(e));
    }
  }
}

// ---------- Principal ----------

const ejecutar: Record<Fase, () => Promise<void>> = {
  presencia: fasePresencia,
  cobertura: faseCobertura,
  elevacion: faseElevacion,
  vias: faseVias,
  clima: faseClima,
};

console.log("Precálculo regional — región clima " + JSON.stringify(region.clima) + ", detalle " + JSON.stringify(region.detalle));
if (solo) console.log("Solo la fase: " + solo);
if (limite !== Infinity) console.log("Límite por fase: " + limite);
for (const fase of FASES) {
  if (solo && solo !== fase) continue;
  console.log("\n== Fase: " + fase + " ==");
  try {
    await ejecutar[fase]();
  } catch (e) {
    console.log("❌ La fase " + fase + " se detuvo: " + mensajeError(e));
    resumenes.push({ fase, esperadas: 1, listas: 0, procesadas: 0, errores: 1 });
  }
}

console.log("\n== Resumen (" + hace() + ") ==");
let todoListo = true;
for (const r of resumenes) {
  const ok = r.listas === r.esperadas;
  if (!ok) todoListo = false;
  console.log("  " + (ok ? "✅" : "⚠️ ") + " " + r.fase + ": " + r.listas + "/" + r.esperadas + " listos, " + r.procesadas + " procesados ahora, " + r.errores + " con error");
}
const conteos = await repositorio.conteos();
console.log("  Filas: " + Object.entries(conteos).map(([t, n]) => t + "=" + n).join(", "));
if (!todoListo) {
  console.log("\nIncompleto: vuelve a ejecutar el script para reanudar (usa --reintentar-errores para repetir los bloques con error).");
}
Deno.exit(todoListo ? 0 : 1);
