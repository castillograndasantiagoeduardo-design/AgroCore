/**
 * Recomendación por época (fase 3) y regla de presencia local (cambio pedido por el usuario).
 */
import { assert, assertEquals } from "@std/assert";
import { ADVERTENCIA_POCO_COMUN, OBJETIVOS } from "@agrocore/contracts";
import { derivarEpocas } from "../../src/modules/recomendacion/domain/services/epocas.service.ts";
import { recomendarPorEpoca } from "../../src/modules/recomendacion/domain/services/recomendar-epoca.service.ts";
import { crearPresenciaMotor } from "../../src/modules/recomendacion/application/presencia.ts";
import { catalogo, MESES_DUITAMA, perfilSintetico, PRESENCIA_DUITAMA } from "./_fixtures.ts";

const MEDITERRANEO = [
  { tMedia: 9.5, amplitud: 10, lluvia: 70, nochesHelada: 0.1 },
  { tMedia: 11, amplitud: 11, lluvia: 60, nochesHelada: 0.06 },
  { tMedia: 13.5, amplitud: 12, lluvia: 50, nochesHelada: 0.02 },
  { tMedia: 16, amplitud: 13, lluvia: 55, nochesHelada: 0 },
  { tMedia: 20, amplitud: 15, lluvia: 30, nochesHelada: 0 },
  { tMedia: 25, amplitud: 17, lluvia: 10, nochesHelada: 0 },
  { tMedia: 28, amplitud: 18, lluvia: 2, nochesHelada: 0 },
  { tMedia: 28, amplitud: 18, lluvia: 4, nochesHelada: 0 },
  { tMedia: 24, amplitud: 16, lluvia: 20, nochesHelada: 0 },
  { tMedia: 18.5, amplitud: 13, lluvia: 65, nochesHelada: 0 },
  { tMedia: 13, amplitud: 11, lluvia: 85, nochesHelada: 0.03 },
  { tMedia: 10, amplitud: 10, lluvia: 90, nochesHelada: 0.08 },
];

Deno.test("épocas: el clima mediterráneo tiene época seca en verano y los meses quedan cubiertos una sola vez", async () => {
  const perfil = await perfilSintetico(MEDITERRANEO, 37.85, 120);
  const epocas = derivarEpocas(perfil, "serie_diaria");
  const meses = epocas.flatMap((e) => e.meses).sort((a, b) => a - b);
  assertEquals(meses, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const seca = epocas.find((e) => e.tipo === "seca");
  assert(seca, "debe haber época seca");
  assert(seca.meses.includes(7) && seca.meses.includes(8), "julio y agosto son secos");
  assert(seca.nombre.startsWith("Época seca de "), seca.nombre);
  for (const e of epocas) {
    assertEquals(e.datos.lluviaMm.fuente, "NASA_POWER");
    assert(e.queOcurre.length > 10);
  }
});

Deno.test("épocas: el altiplano bimodal tiene dos épocas de lluvias y heladas en diciembre–febrero", async () => {
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const epocas = derivarEpocas(perfil, "serie_diaria");
  assertEquals(epocas.filter((e) => e.tipo === "lluviosa").length, 2, epocas.map((e) => e.nombre).join(" | "));
  const heladas = epocas.find((e) => e.tipo === "heladas");
  assert(heladas && heladas.meses.includes(1), epocas.map((e) => e.nombre).join(" | "));
});

Deno.test("Duitama, 2.530 m, papa continua, sin riego: la primera recomendación de cada época es un cultivo con presencia en la zona según EVA", async () => {
  const cultivos = catalogo();
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const epocas = derivarEpocas(perfil, "serie_diaria");
  const presencia = crearPresenciaMotor(PRESENCIA_DUITAMA, cultivos);
  const papa = cultivos.find((c) => c.clave === "papa")!;
  const r = recomendarPorEpoca({ perfil, epocas, catalogo: cultivos, tieneRiego: false, cultivoActual: papa, presencia });
  const locales = new Set(Object.keys(PRESENCIA_DUITAMA.areaPorCultivo));

  let sembradas = 0;
  for (const objetivo of OBJETIVOS) {
    assertEquals(r[objetivo].length, epocas.length);
    for (const rec of r[objetivo]) {
      if (rec.accion === "sembrar") {
        sembradas++;
        assert(locales.has(rec.cultivo!.clave), objetivo + " · " + rec.epocaId + ": " + rec.cultivo!.clave + " no se siembra en la zona");
        assertEquals(rec.cultivo!.presenciaLocal, "local");
      }
      // El centeno (sin mercado ni tradición en Boyacá) solo puede aparecer marcado como poco común.
      for (const s of [rec.cultivo, rec.alternativa]) {
        if (s?.clave === "centeno") {
          assertEquals(s.presenciaLocal, "poco_comun");
          assertEquals(s.advertencia, ADVERTENCIA_POCO_COMUN);
          assert(s !== rec.cultivo || rec.accion === "descansar", "el centeno no puede ser la primera recomendación");
        }
      }
      // Toda cifra del texto "por qué" viene acompañada de datos con fuente.
      for (const d of rec.datos) assert(d.fuente && d.tipo, "dato sin fuente");
    }
  }
  assert(sembradas > 0, "en Duitama alguna época debe tener cultivo recomendado");
  // En "Más ingreso" la primera recomendación es local Y tiene dato de ingreso (FAOSTAT).
  for (const rec of r.mas_ingreso) if (rec.accion === "sembrar") assert(rec.fuentes.includes("FAOSTAT"), rec.cultivo!.clave);
});

Deno.test("presencia: sin datos de presencia, ningún cultivo se marca local y 'Más ingreso' no recomienda cultivos sin ingreso", async () => {
  const cultivos = catalogo();
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const epocas = derivarEpocas(perfil, "serie_diaria");
  const presencia = crearPresenciaMotor(null, cultivos);
  const r = recomendarPorEpoca({ perfil, epocas, catalogo: cultivos, tieneRiego: false, cultivoActual: null, presencia });
  for (const rec of r.mas_ingreso) assertEquals(rec.accion === "sembrar", false, "sin presencia local el ingreso es 'sin datos'");
  for (const rec of r.equilibrado) if (rec.cultivo) assert(rec.cultivo.presenciaLocal !== "local");
});
