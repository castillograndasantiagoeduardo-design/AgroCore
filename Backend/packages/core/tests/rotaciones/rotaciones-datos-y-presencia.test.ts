/**
 * Tests de la v2 del motor de rotaciones: datos sin fuente (`camposSinFuente`), ingreso FAOSTAT en escala
 * logarítmica solo con presencia local, penalización por cultivos poco comunes, cultivo actual opcional,
 * consultas previas y evidencia con EcoPortCode. Sin red ni MySQL.
 */
import { assert, assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
import { ADVERTENCIA_POCO_COMUN, ComparacionRotacionesSchema, type PerfilTerrenoDto, type PresenciaLocalNivel } from "@agrocore/contracts";
import { Result } from "@agrocore/shared-kernel";
import {
  AreaSeleccionada,
  buscarMejorSecuencia,
  calcularPuntajes,
  construirVentanas,
  type ContextoSolicitud,
  type Cultivo,
  ENFOQUES_ROTACION,
  evaluarPaso,
  evaluarSecuencia,
  type IAnalisisTerrenoQuery,
  MotorRotaciones,
  NOTA_HELADA_SIN_FUENTE,
  pasoEsViable,
  PRESENCIA_DESCONOCIDA,
  puntajesDeUnPaso,
} from "../../src/index.ts";
import { cultivoDePrueba, cultivosDelCatalogoReal } from "../_fixtures/cultivos.ts";
import { conCambios, conPresencia, contextoDe, perfilSintetico, presenciaDePrueba } from "./_utiles.ts";

const ALTIPLANO = perfilSintetico({
  latitud: 5.8,
  temp: Array(12).fill(14),
  lluvia: [30, 40, 110, 130, 120, 80, 40, 40, 90, 130, 120, 50],
  heladas: [1],
});
const contexto: ContextoSolicitud = { origen: "script", ip: null };
const PRIORIDADES = { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 };

const papa = cultivoDePrueba({ cicloDias: [100, 120] });
const haba = cultivoDePrueba({
  clave: "haba", nombre: "Haba", familias: ["fabaceas"], grupo: "leguminosa", fijaNitrogeno: true, cicloDias: [100, 120],
  temperaturaOptimaC: [10, 18], temperaturaAbsolutaC: [4, 26], toleranciaHelada: "media", necesidadAgua: "media",
  aguaCicloMm: [300, 450], coberturaSuelo: "alta", profundidadRaiz: "profunda", texturas: ["franca", "arcillosa"],
});
const cebada = cultivoDePrueba({
  clave: "cebada", nombre: "Cebada", familias: ["poaceas"], grupo: "cereal", uso: "doble_proposito", cicloDias: [100, 120],
  temperaturaOptimaC: [10, 20], temperaturaAbsolutaC: [4, 28], toleranciaHelada: "alta", necesidadAgua: "baja",
  toleranciaSequia: "alta", aguaCicloMm: [250, 400], valorForrajero: "medio", texturas: ["franca", "arcillosa"],
});
const avenaVicia = cultivoDePrueba({
  clave: "avena_vicia", nombre: "Avena + vicia", familias: ["poaceas", "fabaceas"], grupo: "forraje", uso: "forraje",
  fijaNitrogeno: true, cicloDias: [90, 110], temperaturaOptimaC: [10, 20], temperaturaAbsolutaC: [4, 28],
  toleranciaHelada: "alta", necesidadAgua: "media", aguaCicloMm: [250, 350], coberturaSuelo: "alta", valorForrajero: "alto",
});
const arveja = cultivoDePrueba({
  clave: "arveja", nombre: "Arveja", familias: ["fabaceas"], grupo: "leguminosa", fijaNitrogeno: true, cicloDias: [90, 110],
  temperaturaOptimaC: [10, 18], temperaturaAbsolutaC: [4, 24], toleranciaHelada: "media", necesidadAgua: "media", aguaCicloMm: [300, 450],
});
const CATALOGO: Cultivo[] = [papa, haba, cebada, avenaVicia, arveja];

function terrenoFalso(): IAnalisisTerrenoQuery {
  return {
    analizar: (area: AreaSeleccionada) =>
      Promise.resolve({
        ubicacion: area.resumen(),
        aptitud: "apto",
        mensajeAptitud: "Apto para sembrar",
        afectacion: { carreteraPct: 0, edificacionPct: 0, aguaPct: 0, excluidoPct: 0, puntosMuestreados: 1 },
        viasCercanas: [],
        elevacionM: 2500,
        pendientePct: 5,
        suelo: null,
        humedadSuelo: null,
        ndvi: null,
        cobertura: null,
        fuentes: [],
        vaciosInformacion: [],
        advertencias: [],
      } as PerfilTerrenoDto),
  };
}

const motor = (cs: Cultivo[] = CATALOGO) =>
  new MotorRotaciones(
    { listar: () => Promise.resolve(cs), buscarPorClave: (k) => Promise.resolve(cs.find((c) => c.clave === k) ?? null) },
    { porUbicacion: () => Promise.resolve(Result.ok(ALTIPLANO)) },
    terrenoFalso(),
  );

const area = AreaSeleccionada.desdeDto({ tipo: "punto", latitud: 5.8, longitud: -73 });
if (!area.ok) throw new Error("área de prueba inválida");
const datos = (cultivoActual: string | null) => ({
  area: area.value,
  sitio: { tipo: "ubicacion" as const, nombre: null },
  altitudM: null,
  fuenteAltitud: null,
  tieneRiego: false,
  cultivoActual,
  prioridades: PRIORIDADES,
});

async function compararOk(m: MotorRotaciones, cultivoActual: string | null, previos?: Parameters<MotorRotaciones["comparar"]>[2]) {
  const r = await m.comparar(datos(cultivoActual), contexto, previos);
  if (!r.ok) throw new Error(r.error.code + ": " + r.error.message);
  return r.value;
}

// ---------------------------------------------------------------------------
// Ingreso: escala logarítmica del valor por hectárea, solo con presencia local
// ---------------------------------------------------------------------------
Deno.test("ingreso: escala logarítmica entre el mínimo y el máximo del catálogo, solo con presencia local", () => {
  const baja = cultivoDePrueba({ clave: "baja", nombre: "Baja", cicloDias: [100, 120] });
  const media = cultivoDePrueba({ clave: "media", nombre: "Media", cicloDias: [100, 120] });
  const alta = cultivoDePrueba({ clave: "alta", nombre: "Alta", cicloDias: [100, 120] });
  const rara = cultivoDePrueba({ clave: "rara", nombre: "Rara", cicloDias: [100, 120] });
  const sinValor = cultivoDePrueba({ clave: "sin_valor", nombre: "Sin valor", cicloDias: [100, 120] });
  const catalogo = [baja, media, alta, rara, sinValor];
  const presencia = presenciaDePrueba(
    { baja: "local", media: "local", alta: "local", rara: "poco_comun", sin_valor: "local" },
    { baja: 100, media: 1000, alta: 10000, rara: 5000 },
  );
  const ctx = conPresencia(contextoDe(ALTIPLANO), catalogo, presencia);
  const ingreso = (c: Cultivo) => puntajesDeUnPaso(evaluarPaso(c, 1, false, ctx), ctx).ingreso;

  assertEquals(ingreso(baja), 0);
  assertEquals(ingreso(media), 50); // 1000 es la media geométrica de 100 y 10000
  assertEquals(ingreso(alta), 100);
  assertEquals(ingreso(rara), null, "poco común: sin datos de ingreso aunque tenga valor");
  assertEquals(ingreso(sinValor), null, "sin valor FAOSTAT: sin datos");
  assertEquals(puntajesDeUnPaso(evaluarPaso(null, 2, false, ctx), ctx).ingreso, 0, "el barbecho no da ingreso");

  // Sin presencia (fuente caída): ningún cultivo tiene ingreso.
  const sinPresencia = contextoDe(ALTIPLANO);
  assertEquals(puntajesDeUnPaso(evaluarPaso(alta, 1, false, sinPresencia), sinPresencia).ingreso, null);
  assertEquals(PRESENCIA_DESCONOCIDA.nivel("alta"), "sin_datos");
});

Deno.test("ingreso: lo que no tiene datos aporta 0 al puntaje de la secuencia", () => {
  const a = cultivoDePrueba({ clave: "cultivo_a", nombre: "Cultivo A", cicloDias: [100, 120], familias: ["solanaceas"] });
  const b = cultivoDePrueba({ clave: "cultivo_b", nombre: "Cultivo B", cicloDias: [100, 120], familias: ["poaceas"] });
  const presencia = presenciaDePrueba({ cultivo_a: "local", cultivo_b: "local" }, { cultivo_a: 100, cultivo_b: 10000 }); // a = mínimo (0), b = máximo (100)
  const ctx = conPresencia(contextoDe(ALTIPLANO), [a, b], presencia);
  const s = evaluarSecuencia([a, b, a, b].map((c) => ({ cultivo: c, continua: false })), ctx, PRIORIDADES);
  assertEquals(s.puntajes.ingreso, 50);
  const sinDatos = calcularPuntajes(s.evaluados, contextoDe(ALTIPLANO));
  assertEquals(sinDatos.ingreso, 0);
});

// ---------------------------------------------------------------------------
// Presencia local: penalización, advertencia y primer paso de la estrategia C
// ---------------------------------------------------------------------------
Deno.test("poco común: el puntaje del enfoque baja 20 × la fracción de pasos sembrados poco comunes", () => {
  const elementos = [papa, haba, cebada, haba].map((c) => ({ cultivo: c, continua: false }));
  const base = contextoDe(ALTIPLANO);
  const sinPoco = evaluarSecuencia(elementos, { ...base, presencia: presenciaDePrueba({}) }, PRIORIDADES);
  const conPoco = evaluarSecuencia(elementos, { ...base, presencia: presenciaDePrueba({ papa: "poco_comun" }) }, PRIORIDADES);
  for (const id of ["B", "C", "D"] as const) {
    const puntuar = ENFOQUES_ROTACION[id].opciones.puntuar;
    // 1 de 4 pasos sembrados es poco común → −20 × 1/4.
    assertAlmostEquals(puntuar(sinPoco) - puntuar(conPoco), 5, 1e-9, "enfoque " + id);
  }
});

Deno.test("poco común: con evitarPocoComunPrimero el primer cultivo sembrado nunca es poco común", () => {
  const catalogo = cultivosDelCatalogoReal().slice(0, 20);
  const niveles: Record<string, PresenciaLocalNivel> = {};
  catalogo.forEach((c, i) => (niveles[c.clave] = i % 2 === 0 ? "poco_comun" : "local"));
  const presencia = presenciaDePrueba(niveles, {});
  const ctx = conPresencia(contextoDe(ALTIPLANO), catalogo, presencia);
  const r = buscarMejorSecuencia(catalogo, ctx, PRIORIDADES, { ...ENFOQUES_ROTACION.C.opciones, evitarPocoComunPrimero: true });
  assert(r, "debe existir una secuencia");
  const primero = r.evaluados.find((e) => e.cultivo !== null)!;
  assertNotEquals(primero.presencia, "poco_comun");
});

Deno.test("poco común: la estrategia que incluye un cultivo poco común trae la advertencia exacta con su nombre", async () => {
  const niveles: Record<string, PresenciaLocalNivel> = Object.fromEntries(CATALOGO.map((c) => [c.clave, "poco_comun" as const]));
  const c = await compararOk(motor(), "papa", { presencia: presenciaDePrueba(niveles) });
  for (const e of c.estrategias) {
    const nombres = [...new Set(e.secuencia.filter((p) => p.cultivoClave !== "barbecho" && !p.continua).map((p) => p.cultivoNombre))];
    for (const nombre of nombres) {
      assert(e.riesgos.includes(ADVERTENCIA_POCO_COMUN + " (" + nombre + ")"), e.id + ": falta la advertencia de " + nombre);
    }
  }
  // Con presencia local no hay advertencia.
  const local = Object.fromEntries(CATALOGO.map((x) => [x.clave, "local" as const]));
  const c2 = await compararOk(motor(), "papa", { presencia: presenciaDePrueba(local) });
  assert(c2.estrategias.every((e) => !e.riesgos.some((r) => r.startsWith(ADVERTENCIA_POCO_COMUN))));
});

// ---------------------------------------------------------------------------
// Cultivo actual opcional y consultas previas
// ---------------------------------------------------------------------------
Deno.test("sin cultivo actual: no hay estrategia A y siempre salen B, C y D", async () => {
  const c = await compararOk(motor(), null);
  ComparacionRotacionesSchema.parse(c);
  assertEquals(c.estrategias.map((e) => e.id), ["B", "C", "D"]);
  const claves = c.estrategias.map((e) => e.secuencia.map((p) => p.cultivoClave).join(","));
  assertEquals(new Set(claves).size, 3, "distintas entre sí");
  assert(c.calendario.every((m) => m.cultivosExpuestos.length === 0), "sin A no hay cultivos expuestos");
});

Deno.test("con cultivo actual: A, B y C (D solo si hay prioridad de agua o déficit)", async () => {
  const c = await compararOk(motor(), "papa");
  assertEquals(c.estrategias[0].id, "A");
  assert(c.estrategias.length >= 3);
});

Deno.test("previos: con terreno y perfil ya consultados no se vuelve a llamar a los proveedores", async () => {
  const explota = new MotorRotaciones(
    { listar: () => Promise.resolve(CATALOGO), buscarPorClave: () => Promise.resolve(null) },
    { porUbicacion: () => Promise.reject(new Error("no debía consultar el clima")) },
    { analizar: () => Promise.reject(new Error("no debía consultar el terreno")) },
  );
  const terreno = await terrenoFalso().analizar(area.value);
  const c = await compararOk(explota, "papa", { terreno, perfil: ALTIPLANO });
  assert(c.estrategias.length >= 3);
});

Deno.test("previos: la presencia recibida se usa (el ingreso de lo local deja de ser 0)", async () => {
  const sin = await compararOk(motor(), "papa");
  assert(sin.estrategias.every((e) => e.puntajes.ingreso === 0), "sin presencia el ingreso es 'sin datos' (0)");
  assert(sin.estrategias.every((e) => e.vaciosInformacion.some((v) => v.startsWith("Ingreso sin datos:"))));

  const niveles = Object.fromEntries(CATALOGO.map((c) => [c.clave, "local" as const]));
  const valores = { papa: 8000, haba: 2000, cebada: 500, avena_vicia: 300, arveja: 1500 };
  const con = await compararOk(motor(), "papa", { presencia: presenciaDePrueba(niveles, valores) });
  assert(con.estrategias.some((e) => e.puntajes.ingreso > 0));
});

// ---------------------------------------------------------------------------
// Campos sin fuente
// ---------------------------------------------------------------------------
Deno.test("sin fuente: toleranciaHelada sin temperatura letal → riesgo alto (no viable) si el ciclo pasa por helada", () => {
  const largo = cultivoDePrueba({
    clave: "sensible", nombre: "Sensible", cicloDias: [120, 150], toleranciaHelada: "alta", camposSinFuente: ["toleranciaHelada"],
    temperaturaOptimaC: [10, 18], temperaturaAbsolutaC: [4, 26], aguaCicloMm: [100, 200],
  });
  // Ventana de 5 meses que incluye enero (mes con helada): el ciclo de 5 meses no puede esquivarla.
  const ctxHelada = contextoDe(ALTIPLANO, { ventanas: construirVentanas([{ inicioMes: 11, meses: [11, 12, 1, 2, 3] }]) });
  const ev = evaluarPaso(largo, 1, false, ctxHelada);
  assertEquals(ev.paso.riesgoHelada, "alto");
  assert(ev.paso.notas.includes(NOTA_HELADA_SIN_FUENTE));
  assertEquals(NOTA_HELADA_SIN_FUENTE, "Sin temperatura letal en FAO ECOCROP: no se recomienda en meses con helada");
  assertEquals(pasoEsViable(ev, ctxHelada), false);

  // Con tolerancia "alta" y fuente, el mismo cultivo sí es viable (solo "tolerado").
  const conFuente = cultivoDePrueba({
    clave: "sensible", nombre: "Sensible", cicloDias: [120, 150], toleranciaHelada: "alta",
    temperaturaOptimaC: [10, 18], temperaturaAbsolutaC: [4, 26], aguaCicloMm: [100, 200],
  });
  assertEquals(evaluarPaso(conFuente, 1, false, ctxHelada).paso.riesgoHelada, "tolerado");

  // Sin exposición a la helada: ninguno.
  const ctxSin = contextoDe(ALTIPLANO, { ventanas: construirVentanas([{ inicioMes: 3, meses: [3, 4, 5, 6, 7] }]) });
  assertEquals(evaluarPaso(largo, 1, false, ctxSin).paso.riesgoHelada, "ninguno");
});

Deno.test("sin fuente: texturas sin fuente → texturaCompatible devuelve null y la regla de suelo no la usa", () => {
  const c = cultivoDePrueba({ clave: "cultivo_x", nombre: "Cultivo X", texturas: ["arenosa"], camposSinFuente: ["texturas"], cicloDias: [100, 120] });
  assertEquals(c.texturaCompatible("arcillosa"), null);
  const s = evaluarSecuencia(
    [c, haba, c, haba].map((e) => ({ cultivo: e, continua: false })),
    contextoDe(ALTIPLANO, { suelo: { ph: null, textura: "arcillosa" } }),
    PRIORIDADES,
  );
  assertEquals(s.reglas.find((r) => r.regla === "suelo_compatible")!.cumple, true);
});

Deno.test("sin fuente: forraje y cobertura sin fuente aportan 0 y la estrategia lo declara como vacío de información", async () => {
  const sinDatos = (c: Cultivo) => conCambios(c, { camposSinFuente: ["valorForrajero", "coberturaSuelo"], ecocrop: { codigos: [777], url: "x" } });
  const catalogo = CATALOGO.map(sinDatos);
  const ev = evaluarPaso(catalogo[3], 1, false, contextoDe(ALTIPLANO)); // avena + vicia: forraje "alto" y cobertura "alta" en su ficha
  const p = puntajesDeUnPaso(ev, contextoDe(ALTIPLANO));
  assertEquals(p.forraje, 0);
  assertEquals(p.suelo, Math.round(0.3 * 100 + 0.2 * 30), "sin cobertura: solo N y raíz superficial");

  const c = await compararOk(motor(catalogo), "papa");
  for (const e of c.estrategias) {
    assert(e.vaciosInformacion.some((v) => v.startsWith("Sin dato de valorForrajero en FAO ECOCROP para ")), e.id);
    assert(e.vaciosInformacion.some((v) => v.startsWith("Sin dato de coberturaSuelo en FAO ECOCROP para ")), e.id);
  }
});

Deno.test("sin fuente: temperatura o ciclo sin fuente → el cultivo no es viable", () => {
  const ctx = contextoDe(ALTIPLANO);
  for (const campo of ["temperaturaOptimaC", "temperaturaAbsolutaC", "cicloDias"]) {
    const c = cultivoDePrueba({ cicloDias: [100, 120], camposSinFuente: [campo] });
    assertEquals(pasoEsViable(evaluarPaso(c, 1, false, ctx), ctx), false, campo);
  }
  assertEquals(pasoEsViable(evaluarPaso(cultivoDePrueba({ cicloDias: [100, 120] }), 1, false, ctx), ctx), true);
});

// ---------------------------------------------------------------------------
// Evidencia
// ---------------------------------------------------------------------------
Deno.test("evidencia: las fichas de ECOCROP citan el EcoPortCode y ya no hay frases de confianza", async () => {
  const catalogo = CATALOGO.map((c) => conCambios(c, { ecocrop: { codigos: [4321, 99], url: "https://ecocrop.apps.fao.org" } }));
  const c = await compararOk(motor(catalogo), "papa");
  for (const e of c.estrategias) {
    assert(e.evidencia.some((x) => x.fuente === "ECOCROP" && x.texto.includes("EcoPortCode 4321, 99")), e.id);
    assert(!e.evidencia.some((x) => x.texto.includes("confianza")), e.id);
    assert(!e.riesgos.some((x) => x.includes("confianza")), e.id);
  }
});
