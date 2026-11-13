/**
 * Prueba manual del motor de rotaciones SIN MySQL, en cualquier lugar del mundo: consulta los proveedores
 * reales (NASA POWER, IDEAM si es Colombia, OpenStreetMap, MODIS, SRTM, SoilGrids) y compara las estrategias.
 *
 * Uso (desde Backend/):  deno run -A scripts/probar-rotaciones.ts <lat> <lon> <cultivoActual> [riego: si|no]
 * Ej.:                   deno run -A scripts/probar-rotaciones.ts 5.785 -73.03 papa          (Duitama, rural)
 *                        deno run -A scripts/probar-rotaciones.ts 42.008 -93.7 maiz          (Ames, Iowa)
 */
import {
  AnalizarTerrenoUseCase,
  CompararRotacionesUbicacionUseCase,
  type ContextoSolicitud,
  type IFincaRepository,
  MotorRotaciones,
  ObtenerPerfilClimaticoUseCase,
} from "@agrocore/core";
import { CatalogoCultivosEnMemoria } from "@agrocore/database";
import {
  IdeamNormalesClient,
  NasaPowerClient,
  NasaPowerHumedadClient,
  OpenTopoDataElevacionClient,
  OrnlModisClient,
  OverpassViasClient,
  SistemaReloj,
  SoilGridsClient,
} from "@agrocore/platform";

const latitud = Number(Deno.args[0] ?? "5.785");
const longitud = Number(Deno.args[1] ?? "-73.03");
const cultivoActual = Deno.args[2] ?? "papa";
const tieneRiego = (Deno.args[3] ?? "no") === "si";
const contexto: ContextoSolicitud = { origen: "script", ip: null };

const reloj = new SistemaReloj();
const modis = new OrnlModisClient();
const terreno = new AnalizarTerrenoUseCase({
  vias: new OverpassViasClient(),
  cobertura: modis,
  ndvi: modis,
  suelo: new SoilGridsClient(),
  elevacion: new OpenTopoDataElevacionClient(),
  humedad: new NasaPowerHumedadClient(),
  reloj,
});
const clima = new ObtenerPerfilClimaticoUseCase({} as IFincaRepository, new NasaPowerClient(), new IdeamNormalesClient(), reloj);
const caso = new CompararRotacionesUbicacionUseCase(new MotorRotaciones(new CatalogoCultivosEnMemoria(), clima, terreno));

const inicio = performance.now();
const r = await caso.execute(
  { area: { tipo: "punto", latitud, longitud }, cultivoActual, tieneRiego, prioridades: { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 } },
  contexto,
);
console.log("Tiempo total: " + Math.round(performance.now() - inicio) + " ms");
if (!r.ok) {
  console.error(r.error.code + ": " + r.error.message);
  Deno.exit(1);
}

const c = r.value;
console.log(`\n📍 (${c.sitio.ubicacion.latitud}, ${c.sitio.ubicacion.longitud}) · ${c.sitio.altitudReferenciaM} m (${c.sitio.fuenteAltitud}) · ${c.sitio.clasificacionClimatica} · cultivo: ${c.sitio.cultivoActual} · riego: ${c.sitio.tieneRiego}`);
console.log(`Terreno: ${c.terreno.mensajeAptitud} · pendiente ${c.terreno.pendientePct ?? "?"} % · suelo ${c.terreno.textura ?? "?"} pH ${c.terreno.ph ?? "?"} · baldíos ${JSON.stringify(c.terreno.mesesBaldios)}`);
console.log(`Clima: ${c.clima.fuente} · ${c.clima.regimenLluvias} · ${c.clima.lluviaAnualMm} mm · ET0 ${c.clima.etoAnualMm} · helada ${JSON.stringify(c.clima.mesesRiesgoHelada)} · déficit ${JSON.stringify(c.clima.mesesDeficitHidrico)}`);
console.log("Ventanas:", c.ventanas.map((v) => v.nombre).join(" · "));

console.log("\n=== ESTRATEGIAS ===");
console.table(c.estrategias.map((e) => ({
  estrategia: e.id + " · " + e.nombre,
  secuencia: e.secuencia.map((p) => (p.continua ? "↳" : "") + p.cultivoClave).join(" → "),
  ...e.puntajes,
  total: e.puntajeTotal,
  incumple: e.reglas.filter((x) => !x.cumple).map((x) => x.regla).join(", "),
})));
console.log("Mejor puntuada:", c.estrategiaMejorPuntuada);
console.log("\n=== OPORTUNIDADES ===\n- " + c.oportunidades.map((o) => o.texto).join("\n- "));
console.log("\n=== CALENDARIO ===");
console.log(c.calendario.map((m) => m.nombreMes.slice(0, 3) + ":" + (m.baldio ? "B" : "·") + (m.vulnerabilidad.severidadMaxima?.[0] ?? "·") + (m.oportunidad ? "O" : "·")).join(" "));
if (c.advertencias.length) console.log("\nAdvertencias:\n- " + c.advertencias.join("\n- "));
