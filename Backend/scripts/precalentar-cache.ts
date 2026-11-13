/**
 * Precalienta las cachés pidiendo la etapa rápida y el detalle de los 5 lugares de la demo (in-process, con
 * createContainer) e imprime el tiempo de cada uno. Una segunda corrida debe salir casi instantánea.
 *
 * Uso (desde Backend/):  deno run -A --env-file=../.env scripts/precalentar-cache.ts
 */
import { createContainer, loadConfigFromEnv } from "@agrocore/composition";

const LUGARES = [
  { nombre: "Duitama (lote rural)", latitud: 5.785, longitud: -73.03 },
  { nombre: "Ames, Iowa", latitud: 42.008, longitud: -93.7 },
  { nombre: "Nakuru, Kenia", latitud: -0.27, longitud: 36.15 },
  { nombre: "Córdoba, Andalucía", latitud: 37.85, longitud: -4.85 },
  { nombre: "Autopista A-4", latitud: 37.89234, longitud: -4.739788 },
];

const contenedor = createContainer(loadConfigFromEnv());
const contexto = { origen: "script" as const, ip: null };

console.log("Lugar".padEnd(24) + "rápida".padStart(10) + "detalle".padStart(10) + "  origen / estado");
for (const l of LUGARES) {
  const entrada = {
    area: { tipo: "punto" as const, latitud: l.latitud, longitud: l.longitud },
    tieneRiego: false,
    objetivo: "equilibrado" as const,
  };
  let t = performance.now();
  const rapida = await contenedor.recomendacionRapida.execute(entrada, contexto);
  const msRapida = Math.round(performance.now() - t);
  t = performance.now();
  const detalle = await contenedor.recomendacionDetalle.execute(entrada, contexto);
  const msDetalle = Math.round(performance.now() - t);
  const estado = (rapida.ok ? "rápida: " + rapida.value.origen : "rápida ERROR " + rapida.error.code) +
    (detalle.ok ? " | detalle ok" : " | detalle ERROR " + detalle.error.code);
  console.log(l.nombre.padEnd(24) + (msRapida + " ms").padStart(10) + (msDetalle + " ms").padStart(10) + "  " + estado);
}
Deno.exit(0);
