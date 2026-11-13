/**
 * Tests del módulo cultivos con un catálogo sintético en memoria (sin MySQL).
 */
import { assertEquals } from "@std/assert";
import {
  type CrearCultivoDatos,
  Cultivo,
  type ICultivoRepository,
  ListarCultivosUseCase,
  ObtenerCultivoUseCase,
  type ContextoSolicitud,
} from "../../src/index.ts";

/** Plantilla válida; cada test cambia solo lo que le interesa. */
function datos(cambios: Partial<CrearCultivoDatos> = {}): CrearCultivoDatos {
  return {
    clave: "papa",
    nombre: "Papa",
    nombreCientifico: "Solanum tuberosum",
    familias: ["solanaceas"],
    uso: "alimento",
    perenne: false,
    cicloDias: [120, 180],
    altitudM: [2000, 3500],
    altitudOptimaM: [2500, 3000],
    toleranciaHelada: "baja",
    necesidadAgua: "alta",
    aguaCicloMm: [500, 700],
    fijaNitrogeno: false,
    coberturaSuelo: "media",
    valorForrajero: "bajo",
    notas: [],
    fuentes: ["Fuente de prueba"],
    ...cambios,
  };
}

function cultivo(cambios: Partial<CrearCultivoDatos> = {}): Cultivo {
  const r = Cultivo.crear(datos(cambios));
  if (!r.ok) throw new Error("Datos de prueba inválidos: " + r.error.message);
  return r.value;
}

const papa = cultivo();
const haba = cultivo({
  clave: "haba", nombre: "Haba", familias: ["fabaceas"], fijaNitrogeno: true,
  altitudM: [2400, 3500], altitudOptimaM: [2600, 3200], toleranciaHelada: "alta",
});
const maiz = cultivo({
  clave: "maiz", nombre: "Maíz", familias: ["poaceas"], uso: "doble_proposito",
  altitudM: [1800, 2900], altitudOptimaM: [2200, 2700],
});

function repo(cultivos: Cultivo[]): ICultivoRepository {
  return {
    listar: () => Promise.resolve(cultivos),
    buscarPorClave: (clave) => Promise.resolve(cultivos.find((c) => c.clave === clave) ?? null),
  };
}

const actor: ContextoSolicitud = { origen: "script", ip: null };
const listar = new ListarCultivosUseCase(repo([haba, maiz, papa]));

// ---------------------------------------------------------------------------
// Entidad: invariantes
// ---------------------------------------------------------------------------
Deno.test("Cultivo: altitud óptima fuera del rango posible → CULTIVO_DATOS_INVALIDOS", () => {
  const r = Cultivo.crear(datos({ altitudOptimaM: [1800, 3000] }));
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "CULTIVO_DATOS_INVALIDOS");
});

Deno.test("Cultivo: rango con mínimo mayor que máximo → CULTIVO_DATOS_INVALIDOS", () => {
  const r = Cultivo.crear(datos({ cicloDias: [180, 120] }));
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.message.includes("cicloDias"), true);
});

Deno.test("Cultivo: una solanácea no puede fijar nitrógeno", () => {
  assertEquals(Cultivo.crear(datos({ fijaNitrogeno: true })).ok, false);
});

Deno.test("Cultivo: sin fuentes no se acepta", () => {
  assertEquals(Cultivo.crear(datos({ fuentes: [] })).ok, false);
});

Deno.test("Cultivo: aptitud por altitud (óptima / posible / no apta)", () => {
  assertEquals(papa.aptitudPorAltitud(2700), "optima");
  assertEquals(papa.aptitudPorAltitud(3300), "posible");
  assertEquals(papa.aptitudPorAltitud(3800), "no_apta");
});

Deno.test("Cultivo: comparten familia (papa tras papa sí, haba tras papa no)", () => {
  assertEquals(papa.compartenFamilia(cultivo()), true);
  assertEquals(papa.compartenFamilia(haba), false);
});

// ---------------------------------------------------------------------------
// ListarCultivosUseCase
// ---------------------------------------------------------------------------
Deno.test("Listar: sin filtros devuelve todo y sin aptitudAltitud", async () => {
  const r = await listar.execute({}, actor);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.length, 3);
    assertEquals(r.value[0].aptitudAltitud, undefined);
  }
});

Deno.test("Listar: a 3.100 m quita el maíz y pone primero los óptimos", async () => {
  const r = await listar.execute({ altitudM: 3100 }, actor);
  assertEquals(r.ok, true);
  if (r.ok) {
    // haba: óptima (2600–3200) · papa: posible (óptima hasta 3000) · maíz: no apta (máx 2900)
    assertEquals(r.value.map((c) => [c.clave, c.aptitudAltitud]), [["haba", "optima"], ["papa", "posible"]]);
  }
});

Deno.test("Listar: filtros combinados (leguminosas que fijan N)", async () => {
  const r = await listar.execute({ familia: "fabaceas", fijaNitrogeno: true }, actor);
  if (r.ok) assertEquals(r.value.map((c) => c.clave), ["haba"]);
});

Deno.test("Listar: tolerancia mínima 'media' excluye los de tolerancia baja", async () => {
  const r = await listar.execute({ toleranciaHeladaMin: "media" }, actor);
  if (r.ok) assertEquals(r.value.map((c) => c.clave), ["haba"]);
});

Deno.test("Listar: filtro por uso", async () => {
  const r = await listar.execute({ uso: "doble_proposito" }, actor);
  if (r.ok) assertEquals(r.value.map((c) => c.clave), ["maiz"]);
});

// ---------------------------------------------------------------------------
// ObtenerCultivoUseCase
// ---------------------------------------------------------------------------
Deno.test("Obtener: devuelve la ficha completa", async () => {
  const r = await new ObtenerCultivoUseCase(repo([papa])).execute({ clave: "papa" }, actor);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.nombreCientifico, "Solanum tuberosum");
    assertEquals(r.value.altitudOptimaM, { min: 2500, max: 3000 });
  }
});

Deno.test("Obtener: clave inexistente → CULTIVO_NO_ENCONTRADO", async () => {
  const r = await new ObtenerCultivoUseCase(repo([papa])).execute({ clave: "yuca" }, actor);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "CULTIVO_NO_ENCONTRADO");
});
