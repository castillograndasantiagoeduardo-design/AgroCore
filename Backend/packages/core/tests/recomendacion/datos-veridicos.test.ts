/**
 * Fase 2.5 — CERO DATOS INVENTADOS. Este test falla si:
 *   1. un valor del catálogo que se usa para decidir no tiene fuente (o no coincide con la fuente citada);
 *   2. una cifra del resultado (etapa rápida o detalle) no viene como DatoConFuente;
 *   3. con un proveedor caído aparece un número en lugar de "Sin datos de …";
 *   4. un campo marcado sin fuente se usa para decidir (cultivo sin temperatura letal recomendado en meses de helada).
 */
import { assert, assertEquals } from "@std/assert";
import { Result } from "@agrocore/shared-kernel";
import { OBJETIVOS } from "@agrocore/contracts";
import { RecomendarPorEpocaUseCase } from "../../src/modules/recomendacion/application/use-cases/recomendar-por-epoca.use-case.ts";
import { RecomendacionDetalleUseCase } from "../../src/modules/recomendacion/application/use-cases/recomendacion-detalle.use-case.ts";
import { derivarEpocas } from "../../src/modules/recomendacion/domain/services/epocas.service.ts";
import { recomendarPorEpoca } from "../../src/modules/recomendacion/domain/services/recomendar-epoca.service.ts";
import { crearPresenciaMotor } from "../../src/modules/recomendacion/application/presencia.ts";
import { mesesHeladaFrecuente } from "../../src/modules/rotaciones/domain/services/evaluar-paso.service.ts";
import { catalogo, MESES_DUITAMA, perfilSintetico, PRESENCIA_DUITAMA, repoCultivos } from "./_fixtures.ts";

/** Campos del catálogo que el motor usa para decidir. */
const CAMPOS_DECISION = [
  "temperaturaOptimaC", "temperaturaAbsolutaC", "lluviaAnualOptimaMm", "aguaCicloMm", "phOptimo", "cicloDias", "toleranciaHelada",
  "toleranciaCalor", "toleranciaSequia", "necesidadAgua", "texturas", "profundidadRaiz", "valorForrajero", "coberturaSuelo", "familias",
  "fijaNitrogeno",
] as const;

/** Claves numéricas estructurales (no son datos del mundo): meses, orden, geometría y la ubicación que eligió el usuario. */
const ESTRUCTURALES = new Set(["mes", "meses", "orden", "anio", "mesSiembra", "mesCosecha", "mesesCiclo", "mesesBaldios", "indice", "geometria", "latitud", "longitud", "areaHa"]);

function esDato(o: Record<string, unknown>): boolean {
  return "valor" in o && "fuente" in o && "tipo" in o;
}

/** Rutas de los números que NO están dentro de un DatoConFuente. */
function cifrasSinFuente(x: unknown, ruta = "$"): string[] {
  if (typeof x === "number") return [ruta];
  if (Array.isArray(x)) return x.flatMap((v, i) => cifrasSinFuente(v, ruta + "[" + i + "]"));
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (esDato(o)) return [];
    return Object.entries(o).flatMap(([k, v]) => (ESTRUCTURALES.has(k) ? [] : cifrasSinFuente(v, ruta + "." + k)));
  }
  return [];
}

/** Lee Docs/fuentes/ecocrop_registros.tsv (el extracto de FAO ECOCROP con el que se generó el catálogo). */
function registrosEcocrop(): Map<string, Record<string, string>[]> {
  const [cab, ...lineas] = Deno.readTextFileSync(new URL("../../../../../Docs/fuentes/ecocrop_registros.tsv", import.meta.url)).replace(/\r/g, "").split("\n").filter(Boolean);
  const campos = cab.split("\t");
  const m = new Map<string, Record<string, string>[]>();
  for (const l of lineas) {
    const f = Object.fromEntries(campos.map((c, i) => [c, l.split("\t")[i]]));
    m.set(f.clave, [...(m.get(f.clave) ?? []), f]);
  }
  return m;
}

Deno.test("catálogo: todo valor que decide tiene fuente concreta (FAO ECOCROP con EcoPortCode) o está declarado sin fuente", () => {
  for (const c of catalogo()) {
    for (const campo of CAMPOS_DECISION) {
      const f = c.fuenteDe(campo);
      const sin = c.sinFuente(campo);
      assert(f !== null || sin, c.clave + "." + campo + " no tiene fuente ni está en camposSinFuente");
      assert(!(f !== null && sin), c.clave + "." + campo + " no puede tener fuente y a la vez estar sin fuente");
      if (f) {
        assertEquals(f.fuente, "FAO_ECOCROP", c.clave + "." + campo);
        for (const codigo of c.ecocrop.codigos) assert(f.referencia.includes(String(codigo)), c.clave + "." + campo + ": la referencia no cita el EcoPortCode " + codigo);
      }
    }
    // Ingreso: valor de FAOSTAT o null (nunca un nivel inventado).
    assertEquals(c.valorProduccionHa.fuente, "FAOSTAT");
    if (c.valorProduccionHa.valor === null) assert(c.sinFuente("valorProduccionHa"));
  }
});

Deno.test("catálogo: los rangos coinciden con el registro de FAO ECOCROP citado", () => {
  const reg = registrosEcocrop();
  for (const c of catalogo()) {
    const fs = reg.get(c.clave);
    assert(fs, "falta el registro ECOCROP de " + c.clave);
    if (fs.length !== 1) continue; // asociaciones: intersección (ver generar-catalogo.ts)
    const f = fs[0];
    assertEquals([c.temperaturaOptimaC.min, c.temperaturaOptimaC.max], [Number(f.TOPMN), Number(f.TOPMX)], c.clave + " T óptima");
    assertEquals([c.temperaturaAbsolutaC.min, c.temperaturaAbsolutaC.max], [Number(f.TMIN), Number(f.TMAX)], c.clave + " T absoluta");
    assertEquals([c.lluviaAnualOptimaMm.min, c.lluviaAnualOptimaMm.max], [Number(f.ROPMN), Number(f.ROPMX)], c.clave + " lluvia");
    assertEquals([c.phOptimo.min, c.phOptimo.max], [Number(f.PHOPMN), Number(f.PHOPMX)], c.clave + " pH");
    assertEquals([c.cicloDias.min, c.cicloDias.max], [Number(f.GMIN), Number(f.GMAX)], c.clave + " ciclo");
  }
});

Deno.test("sin fuente no decide: un cultivo sin temperatura letal en ECOCROP nunca se recomienda en meses de helada frecuente", async () => {
  const cultivos = catalogo();
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const helada = mesesHeladaFrecuente(perfil);
  assert(helada.length > 0, "el perfil de prueba debe tener heladas");
  const epocas = derivarEpocas(perfil, "serie_diaria");
  const r = recomendarPorEpoca({ perfil, epocas, catalogo: cultivos, tieneRiego: false, cultivoActual: null, presencia: crearPresenciaMotor(PRESENCIA_DUITAMA, cultivos) });
  for (const o of OBJETIVOS) {
    for (const rec of r[o]) {
      for (const s of [rec.cultivo, rec.alternativa]) {
        if (!s) continue;
        const c = cultivos.find((x) => x.clave === s.clave)!;
        if (!c.sinFuente("toleranciaHelada")) continue;
        const epoca = epocas.find((e) => e.id === rec.epocaId)!;
        assert(!epoca.meses.some((m) => helada.includes(m)) || rec.accion === "descansar", o + ": " + c.clave + " sin temperatura letal en época con helada");
      }
    }
  }
});

const reloj = { hoy: () => new Date("2026-11-13T12:00:00Z") };
const temporizador = { esperar: (ms: number) => new Promise<void>((res) => setTimeout(res, Math.max(1, Math.round(ms / 500)))) };
const entrada = { area: { tipo: "punto" as const, latitud: 5.785, longitud: -73.03 }, cultivoActual: "papa", tieneRiego: false, objetivo: "equilibrado" as const };
const contexto = { origen: "script" as const, ip: null };

Deno.test("resultado de la etapa rápida: toda cifra viene como DatoConFuente", async () => {
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const uc = new RecomendarPorEpocaUseCase({
    vias: { obtenerElementos: () => Promise.resolve(Result.ok({ vias: [{ tipo: "primary", nombre: "Vía", geometria: [[5.786, -73.031], [5.787, -73.032]] }], edificaciones: [], aguaPoligonos: [], aguaLineas: [], fuente: "OpenStreetMap" })) },
    cobertura: { obtenerCobertura: () => Promise.resolve(Result.ok({ claseIgbp: 12, anio: 2023, fuente: "MODIS MCD12Q1" })) },
    elevacion: { obtenerElevaciones: () => Promise.resolve(Result.ok({ fuente: "SRTM", elevacionesM: [2530] })) },
    clima: { porUbicacionRapida: () => Promise.resolve(Result.ok({ perfil, origen: "serie_diaria" as const })) },
    presencia: { obtenerPresencia: () => Promise.resolve(Result.ok(PRESENCIA_DUITAMA)) },
    cultivos: repoCultivos(),
    temporizador,
    reloj,
  });
  const r = await uc.execute(entrada, contexto);
  assert(r.ok);
  assertEquals(cifrasSinFuente(r.value), [], "cifras sin DatoConFuente");
});

Deno.test("detalle con SoilGrids, MODIS y SRTM caídos: no aparece ningún número de suelo, vegetación ni elevación", async () => {
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const terrenoSinProveedores = {
    ubicacion: { tipo: "punto" as const, latitud: 5.785, longitud: -73.03, areaHa: null, hemisferio: "norte" as const },
    aptitud: "apto" as const,
    mensajeAptitud: "Apto para sembrar",
    afectacion: { carreteraPct: 0, edificacionPct: 0, aguaPct: 0, excluidoPct: 0, puntosMuestreados: 1 },
    viasCercanas: [],
    elevacionM: null,
    pendientePct: null,
    suelo: null,
    humedadSuelo: null,
    ndvi: null,
    cobertura: null,
    fuentes: [],
    vaciosInformacion: ["Sin datos de suelo"],
    advertencias: ["Suelo (SoilGrids): no respondió"],
  };
  const uc = new RecomendacionDetalleUseCase({
    terreno: { analizar: () => Promise.resolve(terrenoSinProveedores) },
    clima: { porUbicacion: () => Promise.resolve(Result.ok(perfil)) },
    presencia: { obtenerPresencia: () => Promise.resolve(Result.ok(PRESENCIA_DUITAMA)) },
    cultivos: repoCultivos(),
    motor: { comparar: () => Promise.resolve(Result.err({ code: "SIN_ALTERNATIVAS", message: "prueba" })) } as never,
    temporizador,
    reloj,
  });
  const r = await uc.execute(entrada, contexto);
  assert(r.ok);
  const t = r.value.terreno;
  for (const d of [t.elevacionM, t.pendientePct, t.suelo.ph, t.suelo.arenaPct, t.suelo.arcillaPct, t.suelo.carbonoOrganicoGKg, ...t.vegetacion.ndviMensual.map((x) => x.ndvi)]) {
    assertEquals(d.valor, null, "con el proveedor caído apareció un número");
    assert(d.nota?.startsWith("Sin datos"), "falta el 'Sin datos de …': " + JSON.stringify(d));
  }
  assertEquals(cifrasSinFuente(r.value), [], "cifras sin DatoConFuente");
});
