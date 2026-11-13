/**
 * Prueba manual del módulo rotaciones SIN MySQL: crea una finca en memoria, consulta NASA POWER y las
 * normales del IDEAM de verdad (tarda ~45 s) y compara las 3 estrategias de rotación.
 *
 * Uso (desde Backend/):  deno run -A scripts/probar-rotaciones.ts [altitudM] [cultivoActual]
 * Por defecto: 2530 y "papa".
 */
import { CompararRotacionesUseCase, type ContextoSolicitud, Finca, type IFincaRepository, ObtenerPerfilClimaticoUseCase } from "@agrocore/core";
import { CatalogoCultivosEnMemoria } from "@agrocore/database";
import { IdeamNormalesClient, NasaPowerClient, SistemaReloj } from "@agrocore/platform";

const altitudM = Deno.args[0] ? Number(Deno.args[0]) : 2530;
const cultivoActual = Deno.args[1] ?? "papa";

const creada = Finca.crear({ nombre: "Prueba Duitama", latitud: 5.8269, longitud: -73.0297, altitudM, cultivoActual });
if (!creada.ok) throw new Error(creada.error.message);
const finca = creada.value;

const fincas: IFincaRepository = {
  buscarPorId: () => Promise.resolve(finca),
  buscarPorNombre: () => Promise.resolve(null),
  listar: () => Promise.resolve({ items: [finca], total: 1, page: 1, pageSize: 1 }),
  guardar: (f) => Promise.resolve(f),
};
const actor: ContextoSolicitud = { origen: "script", ip: null };

const perfil = new ObtenerPerfilClimaticoUseCase(fincas, new NasaPowerClient(), new IdeamNormalesClient(), new SistemaReloj());
const caso = new CompararRotacionesUseCase(fincas, new CatalogoCultivosEnMemoria(), perfil);

const inicio = performance.now();
const r = await caso.execute({ fincaId: 1, prioridades: { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 } }, actor);
console.log("Tiempo total: " + Math.round(performance.now() - inicio) + " ms");
if (!r.ok) {
  console.error(r.error.code, r.error.message);
  Deno.exit(1);
}

const c = r.value;
console.log(`\nFinca a ${c.finca.altitudReferenciaM} m (${c.finca.zonaAltitudinal}) · cultivo actual: ${c.finca.cultivoActual} · riego: ${c.finca.tieneRiego}`);
console.log(`Clima: ${c.clima.fuente} · calibrado: ${c.clima.calibrado} · ${c.clima.lluviaAnualMm} mm/año`);
console.log("Meses lluviosos:", c.clima.mesesLluviosos, "· meses de helada:", c.clima.mesesRiesgoHelada);
console.log("Ventanas de siembra:", c.ventanasSiembra.map((v) => `${v.nombreMes}${v.coincideConLluvias ? "" : " (sin lluvias)"}`).join(" y "));

console.log("\n=== SECUENCIAS (4 semestres) ===");
console.table(c.estrategias.map((e) => ({
  estrategia: `${e.id} · ${e.nombre}`,
  "sem 1": e.secuencia[0].cultivoClave,
  "sem 2": e.secuencia[1].cultivoClave,
  "sem 3": e.secuencia[2].cultivoClave,
  "sem 4": e.secuencia[3].cultivoClave,
})));

console.log("=== PUNTAJES (0-100) ===");
console.table(c.estrategias.map((e) => ({ estrategia: e.id, ...e.puntajes, total: e.puntajeTotal })));
console.log("Mejor puntuada:", c.estrategiaMejorPuntuada);

for (const e of c.estrategias) {
  console.log(`\n--- ${e.id} · ${e.nombre} ---`);
  console.log("Por qué:", e.porQue);
  console.log("Reglas incumplidas:", e.reglas.filter((x) => !x.cumple).map((x) => x.regla).join(", ") || "ninguna");
  console.log("Riesgos:\n- " + e.riesgos.join("\n- "));
}
if (c.advertencias.length) console.log("\nAdvertencias:\n- " + c.advertencias.join("\n- "));
console.log("\n" + c.aviso);
