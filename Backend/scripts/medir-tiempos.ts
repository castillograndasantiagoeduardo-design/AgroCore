/**
 * Mide el tiempo del primer resultado y del resultado completo en los 5 lugares del E2E,
 * en FRÍO (contenedor nuevo, sin caché en memoria ni caché MySQL) y en CALIENTE (repitiendo en el mismo contenedor),
 * con el desglose por proveedor (el mismo que la cabecera Server-Timing de la API).
 *
 * Uso (desde Backend/):
 *   deno run -A --env-file=../.env scripts/medir-tiempos.ts              # frío y caliente
 *   deno run -A --env-file=../.env scripts/medir-tiempos.ts --solo=caliente
 *   deno run -A --env-file=../.env scripts/medir-tiempos.ts --salida=../Docs/mediciones/base.json
 *
 * No muestra valores de .env. No borra nada: en frío solo se desactiva la caché persistente en este proceso.
 */
import { type AppContainer, createContainer, ejecutarConMedicion, loadConfigFromEnv, type TiemposPeticion } from "@agrocore/composition";
import type { AreaSeleccionadaDto } from "@agrocore/contracts";

interface Lugar {
  nombre: string;
  area: AreaSeleccionadaDto;
  cultivoActual: string;
  /** true si el punto está dentro de la región precalculada (REGION_PRECALCULO). */
  enRegion: boolean;
}

/** Los 5 lugares de scripts/smoke-e2e.ts. La autopista usa el punto sobre el eje de la A-4 verificado con Overpass. */
export const LUGARES: Lugar[] = [
  { nombre: "Duitama (lote rural)", area: { tipo: "punto", latitud: 5.785, longitud: -73.03 }, cultivoActual: "papa", enRegion: true },
  { nombre: "Ames, Iowa", area: { tipo: "punto", latitud: 42.008, longitud: -93.7 }, cultivoActual: "maiz", enRegion: false },
  { nombre: "Nakuru, Kenia", area: { tipo: "punto", latitud: -0.27, longitud: 36.15 }, cultivoActual: "maiz", enRegion: false },
  { nombre: "Córdoba, Andalucía", area: { tipo: "punto", latitud: 37.85, longitud: -4.85 }, cultivoActual: "trigo", enRegion: false },
  { nombre: "Autopista A-4", area: { tipo: "punto", latitud: 37.89234, longitud: -4.739788 }, cultivoActual: "trigo", enRegion: false },
];

interface Medicion {
  lugar: string;
  modo: "frio" | "caliente";
  primerMs: number;
  completoMs: number;
  tiempos: Record<string, number>;
  nota: string;
}

const args = new Map(Deno.args.map((a) => a.replace(/^--/, "").split("=") as [string, string]));
const solo = args.get("solo");
const salida = args.get("salida");

/** Etapas que ve el usuario: "primer resultado" y "completo". Se adaptan a lo que ofrece el contenedor. */
function etapas(c: AppContainer, l: Lugar) {
  const contexto = { origen: "script" as const, ip: null };
  const conRapida = c as unknown as {
    recomendacionRapida?: { execute(i: unknown, ctx: unknown): Promise<{ ok: boolean; error?: { code: string } }> };
    recomendacionDetalle?: { execute(i: unknown, ctx: unknown): Promise<{ ok: boolean; error?: { code: string } }> };
  };
  if (conRapida.recomendacionRapida && conRapida.recomendacionDetalle) {
    const entrada = { area: l.area, cultivoActual: l.cultivoActual, tieneRiego: false };
    return {
      primer: () => conRapida.recomendacionRapida!.execute(entrada, contexto),
      completo: () => conRapida.recomendacionDetalle!.execute(entrada, contexto),
    };
  }
  // Flujo anterior a la v2: el primer dato visible era el terreno; el completo, la comparación de rotaciones.
  const entrada = { area: l.area, cultivoActual: l.cultivoActual, tieneRiego: false, prioridades: { agua: 4, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 } };
  return {
    primer: () => c.analizarTerreno.execute({ area: l.area }, contexto),
    completo: () => c.compararRotacionesUbicacion.execute(entrada as never, contexto),
  };
}

const plano = (t: TiemposPeticion) => Object.fromEntries([...t.entries()].map(([k, v]) => [k, Math.round(v.ms)]));

async function medirLugar(c: AppContainer, l: Lugar, modo: "frio" | "caliente"): Promise<Medicion> {
  const e = etapas(c, l);
  // Primer resultado y completo arrancan a la vez, como en el navegador.
  const inicio = performance.now();
  let primerMs = 0;
  let completoMs = 0;
  const { valor, tiempos } = await ejecutarConMedicion(async () => {
    const pPrimer = e.primer().then((r) => {
      primerMs = performance.now() - inicio;
      return r;
    });
    const pCompleto = e.completo().then((r) => {
      completoMs = performance.now() - inicio;
      return r;
    });
    return await Promise.all([pPrimer, pCompleto]);
  });
  const [r1, r2] = valor;
  const nota = [r1.ok ? "primer ok" : "primer " + r1.error?.code, r2.ok ? "completo ok" : "completo " + r2.error?.code].join(" · ");
  return { lugar: l.nombre, modo, primerMs, completoMs, tiempos: plano(tiempos), nota };
}

const config = loadConfigFromEnv();
const resultados: Medicion[] = [];
const fmt = (ms: number) => (ms / 1000).toFixed(2) + " s";

for (const l of LUGARES) {
  if (solo !== "caliente") {
    const frio = createContainer(config, { sinCachePersistente: true });
    const m = await medirLugar(frio, l, "frio");
    resultados.push(m);
    console.log("FRÍO     · " + l.nombre.padEnd(22) + " primer " + fmt(m.primerMs).padStart(8) + " · completo " + fmt(m.completoMs).padStart(8) + " · " + m.nota);
    console.log("           " + Object.entries(m.tiempos).map(([k, v]) => k + "=" + v).join(" "));
  }
  if (solo !== "frio") {
    const caliente = createContainer(config);
    await medirLugar(caliente, l, "caliente"); // llena memoria y MySQL
    const m = await medirLugar(caliente, l, "caliente");
    resultados.push(m);
    console.log("CALIENTE · " + l.nombre.padEnd(22) + " primer " + fmt(m.primerMs).padStart(8) + " · completo " + fmt(m.completoMs).padStart(8) + " · " + m.nota);
    console.log("           " + Object.entries(m.tiempos).map(([k, v]) => k + "=" + v).join(" "));
  }
}

console.log("\n| Lugar | Modo | Primer resultado | Completo | Proveedor más lento |");
console.log("| :-- | :-- | --: | --: | :-- |");
for (const m of resultados) {
  const [lento, ms] = Object.entries(m.tiempos).filter(([k]) => k !== "serializacion").sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
  console.log("| " + m.lugar + " | " + m.modo + " | " + fmt(m.primerMs) + " | " + fmt(m.completoMs) + " | " + lento + " " + fmt(ms) + " |");
}
if (salida) {
  await Deno.writeTextFile(salida, JSON.stringify({ fecha: new Date().toISOString(), resultados }, null, 2));
  console.log("\nGuardado en " + salida);
}
Deno.exit(0);
