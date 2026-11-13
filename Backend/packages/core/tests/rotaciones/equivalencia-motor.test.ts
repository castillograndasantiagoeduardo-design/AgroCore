/**
 * Equivalencia de la búsqueda: `buscarMejorSecuencia` (ramificación y acotamiento) debe devolver EXACTAMENTE
 * lo mismo que `buscarMejorSecuenciaExhaustiva` (recorrido completo, sin poda ni cota).
 *
 * 20 casos deterministas (semilla fija): climas bimodal de altura, unimodal con invierno, mediterráneo y tropical
 * seco; con y sin riego; presencia local aleatoria; subconjuntos de 12–16 cultivos del catálogo real; enfoques B, C y D.
 */
import { assert, assertEquals } from "@std/assert";
import type { PresenciaLocalNivel } from "@agrocore/contracts";
import {
  buscarMejorSecuencia,
  buscarMejorSecuenciaExhaustiva,
  calcularEscalaIngreso,
  ENFOQUES_ROTACION,
  type OpcionesBusqueda,
  type PresenciaMotor,
} from "../../src/index.ts";
import { cultivosDelCatalogoReal } from "../_fixtures/cultivos.ts";
import { contextoDe, perfilSintetico, presenciaDePrueba } from "./_utiles.ts";

/** Generador pseudoaleatorio determinista (mulberry32). */
function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERFILES = [
  // Trópico de altura bimodal.
  perfilSintetico({ latitud: 5.8, temp: Array(12).fill(14), lluvia: [30, 40, 110, 130, 120, 80, 40, 40, 90, 130, 120, 50], heladas: [1] }),
  // Unimodal con invierno.
  perfilSintetico({
    latitud: 42,
    temp: [-7, -4, 3, 10, 16, 21, 24, 23, 18, 11, 3, -4],
    lluvia: [25, 25, 55, 90, 120, 120, 100, 100, 85, 65, 45, 30],
    heladas: [1, 2, 3, 11, 12],
  }),
  // Mediterráneo: lluvia de otoño a primavera, verano seco y caluroso.
  perfilSintetico({
    latitud: 37.8,
    temp: [9, 10, 13, 15, 19, 24, 28, 28, 24, 18, 13, 10],
    lluvia: [70, 60, 55, 50, 35, 10, 2, 5, 25, 70, 80, 90],
    heladas: [1],
    calor: [7, 8],
  }),
  // Tropical seco: dos estaciones marcadas.
  perfilSintetico({ latitud: 12, temp: [27, 28, 29, 30, 29, 27, 26, 26, 26, 26, 26, 26], lluvia: [5, 5, 10, 40, 150, 200, 210, 220, 200, 120, 30, 10], calor: [3, 4] }),
];

const SUELOS = [
  { ph: null, textura: null },
  { ph: 6.2, textura: "franca" as const },
  { ph: 8.1, textura: "arcillosa" as const },
];

function presenciaAleatoria(claves: string[], rng: () => number): PresenciaMotor {
  const niveles: Record<string, PresenciaLocalNivel> = {};
  const valores: Record<string, number> = {};
  for (const k of claves) {
    const r = rng();
    niveles[k] = r < 0.55 ? "local" : r < 0.8 ? "poco_comun" : "sin_datos";
    if (rng() < 0.85) valores[k] = 100 + Math.floor(rng() * 5000);
  }
  return presenciaDePrueba(niveles, valores);
}

Deno.test("equivalencia: la búsqueda acotada coincide con la exhaustiva en 20 casos deterministas", () => {
  const catalogo = cultivosDelCatalogoReal();
  const rng = aleatorio(20261113);
  const inicio = performance.now();
  let conResultado = 0;

  for (let caso = 0; caso < 20; caso++) {
    const perfil = PERFILES[caso % PERFILES.length];
    const tieneRiego = ((caso >> 2) & 1) === 1;
    const id = (["B", "C", "D"] as const)[caso % 3];

    // Subconjunto aleatorio de 12–16 cultivos del catálogo real (mezcla de Fisher-Yates).
    const mezclado = [...catalogo];
    for (let i = mezclado.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [mezclado[i], mezclado[j]] = [mezclado[j], mezclado[i]];
    }
    const subconjunto = mezclado.slice(0, 12 + Math.floor(rng() * 5));

    const presencia = caso % 4 === 3 ? undefined : presenciaAleatoria(subconjunto.map((c) => c.clave), rng);
    const ctx = contextoDe(perfil, {
      tieneRiego,
      suelo: SUELOS[caso % SUELOS.length],
      presencia,
      escalaIngreso: presencia ? calcularEscalaIngreso(subconjunto, presencia) ?? undefined : undefined,
    });
    const prioridades = { agua: 1 + (caso % 5), suelo: 5 - (caso % 5), plagas: 3, forraje: caso % 6, ingreso: (caso * 3) % 6 };

    const opciones: OpcionesBusqueda = {
      ...ENFOQUES_ROTACION[id].opciones,
      soloAnuales: caso % 5 === 0,
      evitarPocoComunPrimero: id === "C" && caso % 2 === 0,
      requerirClave: id === "B" && caso % 3 === 0 ? subconjunto[0].clave : undefined,
    };

    const acotada = buscarMejorSecuencia(subconjunto, ctx, prioridades, opciones);
    const exhaustiva = buscarMejorSecuenciaExhaustiva(subconjunto, ctx, prioridades, opciones);
    const etiqueta = "caso " + caso + " (" + id + ")";

    assertEquals(acotada === null, exhaustiva === null, etiqueta + ": uno encontró secuencia y el otro no");
    if (acotada && exhaustiva) {
      conResultado++;
      assertEquals(acotada.claves, exhaustiva.claves, etiqueta + ": claves distintas");
      assertEquals(opciones.puntuar(acotada), opciones.puntuar(exhaustiva), etiqueta + ": puntaje distinto");
      assertEquals(acotada.puntajeTotal, exhaustiva.puntajeTotal, etiqueta);
    }
  }

  const segundos = (performance.now() - inicio) / 1000;
  console.log("equivalencia: " + conResultado + " de 20 casos con secuencia; " + segundos.toFixed(2) + " s");
  assert(conResultado >= 12, "demasiados casos sin secuencia (" + conResultado + "): el test no probaría nada");
  assert(segundos < 20, "tardó " + segundos.toFixed(1) + " s (límite 20 s)");
});

Deno.test("equivalencia: excluir secuencias da el mismo resultado en ambas búsquedas", () => {
  const catalogo = cultivosDelCatalogoReal().slice(0, 16);
  const ctx = contextoDe(PERFILES[0]);
  const prioridades = { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 };
  const base = { ...ENFOQUES_ROTACION.B.opciones };
  const primera = buscarMejorSecuencia(catalogo, ctx, prioridades, base);
  assert(primera);
  const excluirSecuencias = [primera.claves.join(",")];
  const a = buscarMejorSecuencia(catalogo, ctx, prioridades, { ...base, excluirSecuencias });
  const b = buscarMejorSecuenciaExhaustiva(catalogo, ctx, prioridades, { ...base, excluirSecuencias });
  assert(a && b);
  assertEquals(a.claves, b.claves);
  assert(a.claves.join(",") !== primera.claves.join(","));
});
