/**
 * Prueba manual del módulo cultivos SIN MySQL: muestra qué cultivos del catálogo global son aptos
 * para un sitio según su temperatura media (y opcionalmente lluvia anual y pH).
 *
 * Uso (desde Backend/):  deno run -A scripts/probar-cultivos.ts [tempMediaC] [lluviaAnualMm] [ph]
 * Ej.:                   deno run -A scripts/probar-cultivos.ts 14.7 880        (Duitama)
 *                        deno run -A scripts/probar-cultivos.ts 9.5 840         (Ames, Iowa: media anual)
 */
import { type ContextoSolicitud, ListarCultivosUseCase } from "@agrocore/core";
import { CATALOGO_CULTIVOS, CatalogoCultivosEnMemoria } from "@agrocore/database";

const tempMediaC = Deno.args[0] ? Number(Deno.args[0]) : 14.7;
const lluviaAnualMm = Deno.args[1] ? Number(Deno.args[1]) : undefined;
const ph = Deno.args[2] ? Number(Deno.args[2]) : undefined;
const actor: ContextoSolicitud = { origen: "script", ip: null };

const r = await new ListarCultivosUseCase(new CatalogoCultivosEnMemoria()).execute({ tempMediaC, lluviaAnualMm, ph }, actor);
if (!r.ok) {
  console.error(r.error.code, r.error.message);
  Deno.exit(1);
}
console.log(`\nCultivos aptos con ${tempMediaC} °C de media${lluviaAnualMm ? ", " + lluviaAnualMm + " mm/año" : ""}${ph ? ", pH " + ph : ""} (${r.value.length} de ${CATALOGO_CULTIVOS.length}):`);
console.table(r.value.map((c) => ({
  clave: c.clave,
  grupo: c.grupo,
  aptitud: c.aptitudClima,
  "T óptima": c.temperaturaOptimaC.min + "–" + c.temperaturaOptimaC.max,
  helada: c.toleranciaHelada,
  calor: c.toleranciaCalor,
  sequia: c.toleranciaSequia,
  N: c.fijaNitrogeno ? "sí" : "",
  confianza: c.confianza,
})));
