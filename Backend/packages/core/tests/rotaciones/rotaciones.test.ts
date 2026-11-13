/**
 * Tests del motor de rotaciones con un catálogo sintético y un perfil climático fijo "tipo Duitama"
 * (sin internet ni MySQL).
 *
 * Perfil: lluviosos 3,4,5,10,11 · helada en enero y febrero · 880 mm/año.
 * Ventanas resultantes: marzo (semestre 1) y octubre (semestre 2).
 */
import { assert, assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
import { ComparacionRotacionesSchema, type PerfilClimaticoDto } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import {
  calcularPuntajes,
  calcularPuntajeTotal,
  calcularVentanasSiembra,
  type ContextoMotor,
  CompararRotacionesUseCase,
  type CrearCultivoDatos,
  Cultivo,
  evaluarPaso,
  evaluarReglas,
  evaluarSecuencia,
  Finca,
  type ICultivoRepository,
  type IFincaRepository,
  type IPerfilClimaticoQuery,
  mesesDelCiclo,
  mesesEntreSiembras,
  NombreFinca,
  puntajeIngresoReferencia,
  UbicacionFinca,
  type ContextoSolicitud,
} from "../../src/index.ts";

// ---------------------------------------------------------------------------
// Datos sintéticos
// ---------------------------------------------------------------------------
const LLUVIA_MES = [30, 40, 80, 120, 110, 50, 35, 40, 60, 120, 120, 75]; // 880 mm/año
const LLUVIOSOS = [3, 4, 5, 10, 11];
const HELADA = [1, 2];
const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function perfil(cambios: { lluviosos?: number[]; helada?: number[] } = {}): PerfilClimaticoDto {
  const lluviosos = cambios.lluviosos ?? LLUVIOSOS;
  const helada = cambios.helada ?? HELADA;
  return {
    fincaId: 1,
    latitud: 5.8269,
    longitud: -73.0297,
    altitudReferenciaM: 2400,
    altitudCeldaM: 2500,
    ajusteTemperaturaC: 0.6,
    periodo: { desde: "1996-01-01", hasta: "2025-12-31", anios: 30 },
    fuente: "NASA POWER (sintético)",
    calibracion: null,
    umbrales: { heladaC: 2, lluviaFuerteMm: 20 },
    meses: LLUVIA_MES.map((lluviaMm, i) => ({
      mes: i + 1,
      nombreMes: NOMBRES[i],
      lluviaMm,
      tempMediaC: 14,
      tempMinC: 7,
      tempMaxC: 20,
      diasHeladaPromedio: helada.includes(i + 1) ? 3 : 0,
      probabilidadHelada: helada.includes(i + 1) ? 0.6 : 0,
      diasLluviaFuertePromedio: 0,
      temporada: lluviosos.includes(i + 1) ? "lluviosa" : "seca",
    })),
    resumen: {
      lluviaAnualMm: LLUVIA_MES.reduce((a, b) => a + b, 0),
      tempMediaAnualC: 14,
      mesesLluviosos: lluviosos,
      mesesSecos: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !lluviosos.includes(m)),
      mesesRiesgoHelada: helada,
    },
    advertencias: ["Advertencia del clima de prueba."],
  };
}

function datos(cambios: Partial<CrearCultivoDatos>): CrearCultivoDatos {
  return {
    clave: "papa",
    nombre: "Papa",
    nombreCientifico: "Solanum tuberosum",
    familias: ["solanaceas"],
    uso: "alimento",
    perenne: false,
    cicloDias: [120, 180],
    altitudM: [2000, 3500],
    altitudOptimaM: [2300, 3000],
    toleranciaHelada: "baja",
    necesidadAgua: "alta",
    aguaCicloMm: [500, 750],
    fijaNitrogeno: false,
    coberturaSuelo: "media",
    valorForrajero: "bajo",
    notas: [],
    fuentes: ["Fuente de prueba"],
    ...cambios,
  };
}

function cultivo(cambios: Partial<CrearCultivoDatos>): Cultivo {
  const r = Cultivo.crear(datos(cambios));
  if (!r.ok) throw new Error("Datos de prueba inválidos: " + r.error.message);
  return r.value;
}

const papa = cultivo({});
const arveja = cultivo({
  clave: "arveja", nombre: "Arveja", familias: ["fabaceas"], fijaNitrogeno: true, cicloDias: [90, 120],
  toleranciaHelada: "media", necesidadAgua: "media", aguaCicloMm: [250, 400], coberturaSuelo: "media",
});
const cebada = cultivo({
  clave: "cebada", nombre: "Cebada", familias: ["poaceas"], cicloDias: [120, 150], toleranciaHelada: "alta",
  necesidadAgua: "baja", aguaCicloMm: [300, 450], coberturaSuelo: "media", uso: "doble_proposito",
});
const avenaVicia = cultivo({
  clave: "avena_vicia", nombre: "Avena + vicia", familias: ["poaceas", "fabaceas"], fijaNitrogeno: true, uso: "forraje",
  cicloDias: [90, 120], toleranciaHelada: "alta", necesidadAgua: "media", aguaCicloMm: [250, 350],
  coberturaSuelo: "alta", valorForrajero: "medio",
});
const raigras = cultivo({
  clave: "raigras_trebol", nombre: "Raigrás + trébol", familias: ["poaceas", "fabaceas"], fijaNitrogeno: true, uso: "forraje",
  perenne: true, cicloDias: [60, 90], toleranciaHelada: "alta", necesidadAgua: "alta", aguaCicloMm: [700, 1000],
  coberturaSuelo: "alta", valorForrajero: "alto",
});
const maizLargo = cultivo({
  clave: "maiz", nombre: "Maíz", familias: ["poaceas"], cicloDias: [240, 300], altitudM: [1800, 2900],
  altitudOptimaM: [2200, 2700], toleranciaHelada: "baja", necesidadAgua: "media", aguaCicloMm: [400, 600],
  coberturaSuelo: "media", valorForrajero: "medio",
});

const CATALOGO = [papa, arveja, cebada, avenaVicia, raigras, maizLargo];

function repoCultivos(cultivos: Cultivo[]): ICultivoRepository {
  return {
    listar: () => Promise.resolve(cultivos),
    buscarPorClave: (clave) => Promise.resolve(cultivos.find((c) => c.clave === clave) ?? null),
  };
}

function finca(opts: { altitudM?: number | null; riego?: boolean; cultivoActual?: string | null } = {}): Finca {
  return Finca.reconstruir({
    id: 1,
    nombre: NombreFinca.reconstruir("Finca de prueba"),
    descripcion: null,
    ubicacion: UbicacionFinca.reconstruir(5.8269, -73.0297, opts.altitudM === undefined ? 2530 : opts.altitudM),
    vereda: null,
    tieneRiego: opts.riego ?? false,
    cultivoActual: opts.cultivoActual === undefined ? "papa" : opts.cultivoActual,
    activo: true,
    creadoEn: new Date(),
  });
}

function repoFincas(f: Finca | null): IFincaRepository {
  return {
    buscarPorId: () => Promise.resolve(f),
    buscarPorNombre: () => Promise.resolve(null),
    listar: () => Promise.resolve({ items: f ? [f] : [], total: f ? 1 : 0, page: 1, pageSize: 1 }),
    guardar: (x) => Promise.resolve(x),
  };
}

function clima(p: PerfilClimaticoDto): IPerfilClimaticoQuery {
  return { execute: () => Promise.resolve(Result.ok(p)) };
}

const actor: ContextoSolicitud = { origen: "script", ip: null };
const PRIORIDADES = { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 };

function caso(f: Finca | null = finca(), p: PerfilClimaticoDto = perfil(), cultivos: Cultivo[] = CATALOGO) {
  return new CompararRotacionesUseCase(repoFincas(f), repoCultivos(cultivos), clima(p));
}

async function comparar(entrada: Partial<{ secuenciaActual: string[]; prioridades: typeof PRIORIDADES }> = {}, c = caso()) {
  const r = await c.execute({ fincaId: 1, prioridades: PRIORIDADES, ...entrada }, actor);
  if (!r.ok) throw new Error("Se esperaba éxito: " + r.error.code + " " + r.error.message);
  return r.value;
}

function ctxMotor(opts: { riego?: boolean; p?: PerfilClimaticoDto; altitudM?: number } = {}): ContextoMotor {
  const p = opts.p ?? perfil();
  return { perfil: p, ventanas: calcularVentanasSiembra(p.meses).ventanas, altitudM: opts.altitudM ?? 2530, tieneRiego: opts.riego ?? false };
}

// ---------------------------------------------------------------------------
// Ventanas y meses del ciclo
// ---------------------------------------------------------------------------
Deno.test("ventanas: marzo y octubre con el perfil tipo Duitama", () => {
  const { ventanas, advertencias } = calcularVentanasSiembra(perfil().meses);
  assertEquals(ventanas.map((v) => v.mesSiembra), [3, 10]);
  assertEquals(ventanas.map((v) => v.nombreMes), ["Marzo", "Octubre"]);
  assertEquals(ventanas.every((v) => v.coincideConLluvias), true);
  assertEquals(advertencias.length, 0);
});

Deno.test("ventanas: si abril es el primer mes lluvioso se usa abril", () => {
  const { ventanas } = calcularVentanasSiembra(perfil({ lluviosos: [4, 5, 9] }).meses);
  assertEquals(ventanas.map((v) => v.mesSiembra), [4, 9]);
});

Deno.test("ventanas: sin meses lluviosos usa marzo y septiembre con advertencia", () => {
  const { ventanas, advertencias } = calcularVentanasSiembra(perfil({ lluviosos: [] }).meses);
  assertEquals(ventanas.map((v) => v.mesSiembra), [3, 9]);
  assertEquals(ventanas.some((v) => v.coincideConLluvias), false);
  assertEquals(advertencias.length, 2);
});

Deno.test("meses del ciclo: cruce de año y meses hasta la siguiente siembra", () => {
  assertEquals(mesesDelCiclo(10, 5), [10, 11, 12, 1, 2]);
  assertEquals(mesesEntreSiembras(3, 10), 7);
  assertEquals(mesesEntreSiembras(10, 3), 5);
});

// ---------------------------------------------------------------------------
// Evaluación de un paso
// ---------------------------------------------------------------------------
Deno.test("paso: papa en el semestre 1 (marzo) no toca heladas y tiene déficit de agua sin riego", () => {
  const { paso, cabeEnVentana } = evaluarPaso(papa, 1, false, ctxMotor());
  assertEquals(paso.mesesCiclo, [3, 4, 5, 6, 7]);
  assertEquals(paso.mesCosecha, 7);
  assertEquals(paso.lluviaCicloMm, 395);
  assertEquals(paso.deficitAguaMm, 105);
  assertEquals(paso.requiereRiego, true);
  assertEquals(paso.riesgoHelada, "ninguno");
  assertEquals(cabeEnVentana, true);
});

Deno.test("paso: el ciclo que cruza el año se parte en diciembre → enero", () => {
  const { paso } = evaluarPaso(papa, 2, false, ctxMotor());
  assertEquals(paso.mesesCiclo, [10, 11, 12, 1, 2]);
  assertEquals(paso.mesesHeladaEnCiclo, [1, 2]);
});

Deno.test("paso: riesgo de helada según tolerancia (baja=alto, media=moderado, alta=tolerado)", () => {
  const ctx = ctxMotor();
  assertEquals(evaluarPaso(papa, 2, false, ctx).paso.riesgoHelada, "alto");
  assertEquals(evaluarPaso(arveja, 2, false, ctx).paso.riesgoHelada, "moderado");
  assertEquals(evaluarPaso(cebada, 2, false, ctx).paso.riesgoHelada, "tolerado");
});

Deno.test("paso: sin déficit cuando la lluvia cubre el mínimo del cultivo", () => {
  const { paso } = evaluarPaso(arveja, 1, false, ctxMotor());
  assertEquals(paso.deficitAguaMm, 0);
  assertEquals(paso.requiereRiego, false);
});

Deno.test("paso: un ciclo largo (maíz, 9 meses) no cabe en la ventana y lo explica en las notas", () => {
  const { paso, cabeEnVentana } = evaluarPaso(maizLargo, 1, false, ctxMotor());
  assertEquals(cabeEnVentana, false);
  assertEquals(paso.notas.some((n) => n.includes("siguiente siembra")), true);
});

Deno.test("paso: la pradera perenne que continúa evalúa el semestre completo y no se resiembra", () => {
  const { paso, cabeEnVentana } = evaluarPaso(raigras, 2, true, ctxMotor());
  assertEquals(paso.continuaPradera, true);
  assertEquals(paso.mesesCiclo, [10, 11, 12, 1, 2]);
  assertEquals(paso.deficitAguaMm, 0); // 880 mm anuales ≥ 700
  assertEquals(cabeEnVentana, true);
});

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------
const regla = (rs: ReturnType<typeof evaluarReglas>, nombre: string) => rs.find((r) => r.regla === nombre)!;

Deno.test("reglas: devuelve siempre las 7 y detecta repetición de familia y falta de leguminosa", () => {
  const ctx = ctxMotor();
  const s = evaluarSecuencia([papa, papa, papa, papa], ctx, PRIORIDADES);
  assertEquals(s.reglas.length, 7);
  assertEquals(regla(s.reglas, "no_repetir_familia").cumple, false);
  assertEquals(regla(s.reglas, "no_repetir_familia").detalle.includes("semestre 1"), true);
  assertEquals(regla(s.reglas, "leguminosa_cada_dos_anios").cumple, false);
  assertEquals(regla(s.reglas, "evitar_helada").cumple, false);
  assertEquals(regla(s.reglas, "agua_suficiente").cumple, false);
  assertEquals(regla(s.reglas, "siembra_inicio_lluvias").cumple, true);
  assertEquals(regla(s.reglas, "altitud_apta").cumple, true);
  assertEquals(regla(s.reglas, "ciclo_cabe_en_ventana").cumple, true);
});

Deno.test("reglas: la pradera perenne continuada no cuenta como repetición de familia", () => {
  const s = evaluarSecuencia([raigras, raigras, raigras, raigras], ctxMotor(), PRIORIDADES);
  assertEquals(regla(s.reglas, "no_repetir_familia").cumple, true);
});

Deno.test("reglas: con riego el déficit de agua no incumple agua_suficiente", () => {
  const sinRiego = evaluarSecuencia([papa, arveja, papa, arveja], ctxMotor({ riego: false }), PRIORIDADES);
  const conRiego = evaluarSecuencia([papa, arveja, papa, arveja], ctxMotor({ riego: true }), PRIORIDADES);
  assertEquals(regla(sinRiego.reglas, "agua_suficiente").cumple, false);
  assertEquals(regla(conRiego.reglas, "agua_suficiente").cumple, true);
});

Deno.test("reglas: altitud no apta, ciclo que no cabe y siembra fuera de lluvias", () => {
  const alta = evaluarSecuencia([maizLargo, arveja, maizLargo, arveja], ctxMotor({ altitudM: 3100 }), PRIORIDADES);
  assertEquals(regla(alta.reglas, "altitud_apta").cumple, false);
  assertEquals(regla(alta.reglas, "ciclo_cabe_en_ventana").cumple, false);
  const seco = evaluarSecuencia([papa, arveja, papa, arveja], ctxMotor({ p: perfil({ lluviosos: [] }) }), PRIORIDADES);
  assertEquals(regla(seco.reglas, "siembra_inicio_lluvias").cumple, false);
});

// ---------------------------------------------------------------------------
// Puntajes
// ---------------------------------------------------------------------------
Deno.test("puntajes: monocultivo de papa sin riego", () => {
  const s = evaluarSecuencia([papa, papa, papa, papa], ctxMotor(), PRIORIDADES);
  assertEquals(s.puntajes, { agua: 0, suelo: 33, plagas: 0, forraje: 25, ingreso: 90 });
});

Deno.test("puntajes: con riego el agua de la papa no se penaliza", () => {
  const ctx = ctxMotor({ riego: true });
  const s = evaluarSecuencia([papa, papa, papa, papa], ctx, PRIORIDADES);
  assertEquals(s.puntajes.agua, 25);
});

Deno.test("puntajes: la pradera de raigrás saca forraje 100, suelo y plagas altos", () => {
  const s = evaluarSecuencia([raigras, raigras, raigras, raigras], ctxMotor(), PRIORIDADES);
  assertEquals(s.puntajes.forraje, 100);
  assertEquals(s.puntajes.plagas, 100);
  assertEquals(s.puntajes.suelo, 94); // 0,6·90 + 0,4·100
});

Deno.test("puntajes: ingreso de referencia (clave desconocida = media)", () => {
  assertEquals(puntajeIngresoReferencia("papa"), 90);
  assertEquals(puntajeIngresoReferencia("trigo"), 30);
  assertEquals(puntajeIngresoReferencia("quinua"), 60);
  assertEquals(puntajeIngresoReferencia("algo_raro"), 60);
});

Deno.test("puntajes: total ponderado y promedio simple si todos los pesos son 0", () => {
  const p = { agua: 0, suelo: 33, plagas: 0, forraje: 25, ingreso: 90 };
  assertEquals(calcularPuntajeTotal(p, { agua: 0, suelo: 0, plagas: 0, forraje: 0, ingreso: 5 }), 90);
  assertEquals(calcularPuntajeTotal(p, { agua: 0, suelo: 0, plagas: 0, forraje: 0, ingreso: 0 }), 30); // (0+33+0+25+90)/5 = 29,6
  assertEquals(calcularPuntajeTotal(p, { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 }), 30);
  assertAlmostEquals(calcularPuntajeTotal(p, { agua: 5, suelo: 0, plagas: 5, forraje: 0, ingreso: 0 }), 0);
  const calculados = calcularPuntajes([papa], [evaluarPaso(papa, 1, false, ctxMotor())], false);
  assertEquals(calculados.ingreso, 90);
});

// ---------------------------------------------------------------------------
// Caso de uso: las 3 estrategias
// ---------------------------------------------------------------------------
Deno.test("estrategia A: monocultivo de papa incumple familia y leguminosa, con plagas bajo", async () => {
  const r = await comparar();
  const a = r.estrategias[0];
  assertEquals(r.estrategias.map((e) => e.id), ["A", "B", "C"]);
  assertEquals(a.secuencia.map((p) => p.cultivoClave), ["papa", "papa", "papa", "papa"]);
  assertEquals(regla(a.reglas, "no_repetir_familia").cumple, false);
  assertEquals(regla(a.reglas, "leguminosa_cada_dos_anios").cumple, false);
  assert(a.puntajes.plagas <= 10);
  assertEquals(a.riesgos.some((x) => x.includes("no_repetir_familia")), true);
  assertEquals(a.vaciosInformacion.some((x) => x.includes("ASUMIÓ")), true);
});

Deno.test("estrategia A: con secuenciaActual enviada no se agrega el vacío de 'asumido'", async () => {
  const r = await comparar({ secuenciaActual: ["papa", "arveja"] });
  const a = r.estrategias[0];
  assertEquals(a.secuencia.map((p) => p.cultivoClave), ["papa", "arveja", "papa", "arveja"]);
  assertEquals(a.vaciosInformacion.some((x) => x.includes("ASUMIÓ")), false);
});

Deno.test("estrategia B: cumple las reglas duras y contiene la papa", async () => {
  const b = (await comparar()).estrategias[1];
  assertEquals(b.enfoque, "suelo");
  assertEquals(b.secuencia.some((p) => p.cultivoClave === "papa"), true);
  for (const nombre of ["no_repetir_familia", "leguminosa_cada_dos_anios", "altitud_apta", "evitar_helada", "ciclo_cabe_en_ventana"]) {
    assertEquals(regla(b.reglas, nombre).cumple, true, nombre);
  }
  assertEquals(b.secuencia.every((p) => p.riesgoHelada !== "alto"), true);
  // B es rotación de cultivos de ciclo corto: no usa la pradera perenne (eso es la estrategia C).
  assertEquals(b.secuencia.some((p) => p.cultivoClave === "raigras_trebol"), false);
});

Deno.test("estrategia C: distinta de B y con más forraje que A", async () => {
  const r = await comparar();
  const [a, b, c] = r.estrategias;
  assertNotEquals(c.secuencia.map((p) => p.cultivoClave).join(","), b.secuencia.map((p) => p.cultivoClave).join(","));
  assert(c.puntajes.forraje > a.puntajes.forraje);
  assertEquals(c.secuencia.some((p) => p.continuaPradera), true);
  // C no incluye la papa: debe advertirlo como riesgo de cambio de actividad.
  assertEquals(c.riesgos.some((x) => x.includes("cambio de actividad productiva")), true);
});

Deno.test("salida: textos con evidencia, prefijo de práctica habitual y avisos fijos", async () => {
  const r = await comparar();
  const b = r.estrategias[1];
  assertEquals(b.evidencia.some((x) => x.startsWith("Práctica recomendada (sin estudio local que fije la cifra)")), true);
  assertEquals(b.evidencia.some((x) => x.includes("NASA POWER")), true);
  assertEquals(b.vaciosInformacion.length, new Set(b.vaciosInformacion).size);
  assertEquals(b.beneficios.length > 0, true);
  assertEquals(r.aviso.includes("no reemplaza el criterio del agricultor"), true);
  assertEquals(r.advertencias.includes("Advertencia del clima de prueba."), true);
  assertEquals(r.ventanasSiembra.map((v) => v.mesSiembra), [3, 10]);
});

Deno.test("estrategiaMejorPuntuada: la de mayor puntaje total (empate: B, C, A)", async () => {
  const r = await comparar();
  const maximo = Math.max(...r.estrategias.map((e) => e.puntajeTotal));
  const ganadora = r.estrategias.find((e) => e.id === r.estrategiaMejorPuntuada)!;
  assertEquals(ganadora.puntajeTotal, maximo);
  // Todos los pesos en 0 → promedio simple; sigue siendo una salida válida.
  const cero = await comparar({ prioridades: { agua: 0, suelo: 0, plagas: 0, forraje: 0, ingreso: 0 } });
  assertEquals(ComparacionRotacionesSchema.safeParse(cero).success, true);
});

Deno.test("salida: pasa ComparacionRotacionesSchema.parse", async () => {
  const r = await comparar();
  ComparacionRotacionesSchema.parse(r);
  const sinAltitud = await comparar({}, caso(finca({ altitudM: null })));
  ComparacionRotacionesSchema.parse(sinAltitud);
  assertEquals(sinAltitud.finca.altitudConocida, false);
  assertEquals(sinAltitud.finca.altitudReferenciaM, 2400);
  assertEquals(sinAltitud.advertencias.some((x) => x.includes("altitud")), true);
});

Deno.test("sin meses lluviosos: advertencias globales y regla de lluvias incumplida", async () => {
  const r = await comparar({}, caso(finca(), perfil({ lluviosos: [] })));
  assertEquals(r.ventanasSiembra.map((v) => v.coincideConLluvias), [false, false]);
  assertEquals(r.advertencias.some((x) => x.includes("lluvioso")), true);
  assertEquals(regla(r.estrategias[0].reglas, "siembra_inicio_lluvias").cumple, false);
});

Deno.test("con riego la estrategia A mejora su puntaje de agua", async () => {
  const sin = await comparar();
  const con = await comparar({}, caso(finca({ riego: true })));
  assert(con.estrategias[0].puntajes.agua > sin.estrategias[0].puntajes.agua);
});

Deno.test("determinismo: dos ejecuciones dan exactamente la misma salida", async () => {
  const a = await comparar();
  const b = await comparar();
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------
Deno.test("error: finca inexistente → FINCA_NO_ENCONTRADO", async () => {
  const r = await caso(null).execute({ fincaId: 99, prioridades: PRIORIDADES }, actor);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "FINCA_NO_ENCONTRADO");
});

Deno.test("error: sin cultivo actual ni secuenciaActual → ROTACION_CULTIVO_ACTUAL_REQUERIDO", async () => {
  const r = await caso(finca({ cultivoActual: null })).execute({ fincaId: 1, prioridades: PRIORIDADES }, actor);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "ROTACION_CULTIVO_ACTUAL_REQUERIDO");
});

Deno.test("error: clave desconocida → ROTACION_CULTIVO_DESCONOCIDO", async () => {
  const r = await caso().execute({ fincaId: 1, prioridades: PRIORIDADES, secuenciaActual: ["papa", "unobtanio"] }, actor);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "ROTACION_CULTIVO_DESCONOCIDO");
});

Deno.test("error: ningún cultivo apto a la altitud → ROTACION_SIN_ALTERNATIVAS", async () => {
  const r = await caso(finca({ altitudM: 1000 })).execute({ fincaId: 1, prioridades: PRIORIDADES }, actor);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "ROTACION_SIN_ALTERNATIVAS");
});

Deno.test("error: el error del clima se propaga tal cual", async () => {
  const falla: IPerfilClimaticoQuery = {
    execute: () => Promise.resolve(Result.err(new DomainError("CLIMA_PROVEEDOR_NO_DISPONIBLE", "NASA caída"))),
  };
  const r = await new CompararRotacionesUseCase(repoFincas(finca()), repoCultivos(CATALOGO), falla).execute(
    { fincaId: 1, prioridades: PRIORIDADES },
    actor,
  );
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "CLIMA_PROVEEDOR_NO_DISPONIBLE");
});
