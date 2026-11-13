/**
 * Prueba manual del módulo clima SIN MySQL: consulta una ubicación y consulta NASA POWER
 * y las normales del IDEAM de verdad. Muestra el perfil SIN calibrar y CALIBRADO lado a lado.
 *
 * Uso (desde Backend/):  deno run -A scripts/probar-clima.ts [altitudM] [latitud] [longitud]
 */
import { type ContextoSolicitud, type INormalesClimatologicasProvider, ObtenerPerfilClimaticoUseCase } from "@agrocore/core";
import { IdeamNormalesClient, NasaPowerClient, SistemaReloj } from "@agrocore/platform";
import { Result } from "@agrocore/shared-kernel";

const altitud = Deno.args[0] ? Number(Deno.args[0]) : 2530;
const latitud = Deno.args[1] ? Number(Deno.args[1]) : 5.8269;
const longitud = Deno.args[2] ? Number(Deno.args[2]) : -73.0297;

const ubicacion = { latitud, longitud, altitudM: altitud };
const nasa = new NasaPowerClient();
const reloj = new SistemaReloj();
const sinIdeam: INormalesClimatologicasProvider = { estacionMasCercana: () => Promise.resolve(Result.ok(null)) };
const actor: ContextoSolicitud = { origen: "script", ip: null };

const inicio = performance.now();
const [crudo, calibrado] = [
  await new ObtenerPerfilClimaticoUseCase(nasa, sinIdeam, reloj).porUbicacion(ubicacion, actor),
  await new ObtenerPerfilClimaticoUseCase(nasa, new IdeamNormalesClient(), reloj).porUbicacion(ubicacion, actor),
];
console.log("Tiempo total: " + Math.round(performance.now() - inicio) + " ms");
if (!crudo.ok || !calibrado.ok) {
  const e = !crudo.ok ? crudo.error : !calibrado.ok ? calibrado.error : null;
  console.error(e?.code, e?.message);
  Deno.exit(1);
}

const a = crudo.value;
const b = calibrado.value;
console.log(`\nFinca: ${latitud}, ${longitud} a ${b.altitudReferenciaM} m · celda NASA ${b.altitudCeldaM} m · ${b.periodo.desde} → ${b.periodo.hasta}`);
if (b.calibracion) {
  const c = b.calibracion;
  console.log(`Calibrado con: ${c.estacion} [${c.codigoEstacion}] (${c.municipioEstacion}), ${c.altitudEstacionM} m, a ${c.distanciaKm} km · ${c.fuente}`);
}

console.log("\n=== SIN CALIBRAR (NASA POWER) vs CALIBRADO (NASA + IDEAM) ===");
console.table(a.meses.map((m, i) => {
  const c = b.meses[i];
  return {
    mes: m.nombreMes,
    "lluvia NASA": m.lluviaMm,
    "lluvia cal.": c.lluviaMm,
    "tmin NASA": m.tempMinC,
    "tmin cal.": c.tempMinC,
    "tmax NASA": m.tempMaxC,
    "tmax cal.": c.tempMaxC,
    "P(helada) NASA": m.probabilidadHelada,
    "P(helada) cal.": c.probabilidadHelada,
    "temporada cal.": c.temporada,
  };
}));
console.log("Lluvia anual:", a.resumen.lluviaAnualMm, "→", b.resumen.lluviaAnualMm, "mm");
console.log("Meses con riesgo de helada:", a.resumen.mesesRiesgoHelada, "→", b.resumen.mesesRiesgoHelada);
console.log("Meses lluviosos calibrados:", b.resumen.mesesLluviosos);
if (b.calibracion) {
  console.log("\nFactores de calibración por mes:");
  console.table(b.calibracion.factores);
}
console.log("Advertencias:\n- " + b.advertencias.join("\n- "));
