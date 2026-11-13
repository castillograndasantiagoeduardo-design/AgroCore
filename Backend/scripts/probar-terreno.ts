/**
 * Prueba manual del módulo terreno SIN MySQL: consulta los proveedores reales (OpenStreetMap, MODIS,
 * SoilGrids, SRTM, NASA POWER) para un punto y muestra el perfil del terreno.
 *
 * Uso (desde Backend/):  deno run -A scripts/probar-terreno.ts <lat> <lon>
 * Ej.:                   deno run -A scripts/probar-terreno.ts 5.8269 -73.0297   (casco urbano de Duitama → carretera)
 */
import { AnalizarTerrenoUseCase, type ContextoSolicitud } from "@agrocore/core";
import {
  NasaPowerHumedadClient,
  OpenTopoDataElevacionClient,
  OrnlModisClient,
  OverpassViasClient,
  SistemaReloj,
  SoilGridsClient,
} from "@agrocore/platform";

const latitud = Number(Deno.args[0] ?? "5.8269");
const longitud = Number(Deno.args[1] ?? "-73.0297");
const contexto: ContextoSolicitud = { origen: "script", ip: null };

const modis = new OrnlModisClient();
const caso = new AnalizarTerrenoUseCase({
  vias: new OverpassViasClient(),
  cobertura: modis,
  ndvi: modis,
  suelo: new SoilGridsClient(),
  elevacion: new OpenTopoDataElevacionClient(),
  humedad: new NasaPowerHumedadClient(),
  reloj: new SistemaReloj(),
});

const inicio = performance.now();
const r = await caso.execute({ area: { tipo: "punto", latitud, longitud } }, contexto);
console.log("Tiempo: " + Math.round(performance.now() - inicio) + " ms");
if (!r.ok) {
  console.error(r.error.code, r.error.message);
  Deno.exit(1);
}
const t = r.value;
console.log(`\n📍 (${t.ubicacion.latitud}, ${t.ubicacion.longitud}) · hemisferio ${t.ubicacion.hemisferio}`);
console.log(`Aptitud: ${t.aptitud} → ${t.mensajeAptitud}`);
console.log("Vías cercanas:", t.viasCercanas.map((v) => `${v.tipo}${v.nombre ? " (" + v.nombre + ")" : ""} a ${v.distanciaM} m [semiancho ${v.semiAnchoM} m]`));
console.log(`Elevación: ${t.elevacionM ?? "?"} m · pendiente: ${t.pendientePct ?? "?"} %`);
console.log("Cobertura MODIS:", t.cobertura ? `${t.cobertura.claseIgbp} ${t.cobertura.nombre} (${t.cobertura.anio})` : "sin dato");
console.log("Suelo:", t.suelo ? `${t.suelo.textura} · pH ${t.suelo.ph} · CO ${t.suelo.carbonoOrganicoGKg} g/kg` : "sin dato");
if (t.ndvi) {
  console.log(`NDVI: ${t.ndvi.serie.length} muestras (${t.ndvi.desde} → ${t.ndvi.hasta})`);
  console.log("  climatología:", t.ndvi.climatologia.map((c) => c.ndviMedio).join(" "));
  console.log("  meses baldíos:", t.ndvi.mesesBaldios, "·", t.ndvi.estres.detalle);
}
console.log("Humedad del suelo (raíz):", t.humedadSuelo?.map((h) => h.raiz).join(" ") ?? "sin dato");
console.log("\nFuentes:\n- " + t.fuentes.join("\n- "));
console.log("Vacíos:\n- " + t.vaciosInformacion.join("\n- "));
if (t.advertencias.length) console.log("Advertencias:\n- " + t.advertencias.join("\n- "));
