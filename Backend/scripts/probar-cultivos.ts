/**
 * Prueba manual del módulo cultivos SIN MySQL ni token: muestra qué cultivos del catálogo
 * son aptos a una altitud dada.
 *
 * Uso (desde Backend/):  deno run -A scripts/probar-cultivos.ts [altitudM]
 */
import { type ContextoSolicitud, ListarCultivosUseCase } from "@duitamacrece/core";
import { CatalogoCultivosEnMemoria } from "@duitamacrece/database";

const altitudM = Deno.args[0] ? Number(Deno.args[0]) : 2530;
const actor: ContextoSolicitud = { origen: "script", ip: null };

const r = await new ListarCultivosUseCase(new CatalogoCultivosEnMemoria()).execute({ altitudM }, actor);
if (!r.ok) {
  console.error(r.error.code, r.error.message);
  Deno.exit(1);
}

console.log(`\nCultivos aptos a ${altitudM} m (${r.value.length} de 11):`);
console.table(r.value.map((c) => ({
  cultivo: c.nombre,
  aptitud: c.aptitudAltitud,
  familias: c.familias.join(" + "),
  "ciclo (días)": `${c.cicloDias.min}–${c.cicloDias.max}`,
  helada: c.toleranciaHelada,
  agua: c.necesidadAgua,
  "fija N": c.fijaNitrogeno ? "sí" : "no",
  cobertura: c.coberturaSuelo,
  forraje: c.valorForrajero,
})));
