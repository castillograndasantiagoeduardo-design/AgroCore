/**
 * Fixtures del módulo recomendacion: catálogo REAL (FAO ECOCROP + FAOSTAT, el mismo de producción), perfiles climáticos
 * generados con el caso de uso de clima a partir de series diarias sintéticas deterministas, y la presencia EVA de
 * Duitama medida el 2026-11-13 (promedio anual de área sembrada 2015-2025 en Duitama y 17 municipios a ≤ 25 km).
 */
import { Result } from "@agrocore/shared-kernel";
import type { PerfilClimaticoDto } from "@agrocore/contracts";
import { CATALOGO_CULTIVOS } from "../../../database/src/catalogos/catalogo-cultivos.datos.ts";
import { Cultivo } from "../../src/modules/cultivos/domain/entities/cultivo.entity.ts";
import { ObtenerPerfilClimaticoUseCase } from "../../src/modules/clima/application/use-cases/obtener-perfil-climatico.use-case.ts";
import type { RegistroClimaDiario } from "../../src/modules/clima/domain/value-objects/registro-clima-diario.vo.ts";
import type { PresenciaLocal } from "../../src/modules/recomendacion/application/ports/index.ts";

export function catalogo(): Cultivo[] {
  return CATALOGO_CULTIVOS.map((d) => {
    const r = Cultivo.crear(d);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  });
}

export const repoCultivos = () => {
  const c = catalogo();
  return { listar: () => Promise.resolve(c), buscarPorClave: (k: string) => Promise.resolve(c.find((x) => x.clave === k) ?? null) };
};

/** Clima mensual de una serie sintética: medias, amplitud diaria, lluvia del mes y fracción de noches con helada. */
export interface MesSintetico {
  tMedia: number;
  amplitud: number;
  lluvia: number;
  /** Fracción de días del mes con mínima ≤ 2 °C. */
  nochesHelada: number;
}

/** PRNG determinista (mulberry32). */
function aleatorio(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function serieSintetica(meses: MesSintetico[], semilla = 7): RegistroClimaDiario[] {
  const azar = aleatorio(semilla);
  const out: RegistroClimaDiario[] = [];
  for (let anio = 1995; anio <= 2025; anio++) {
    for (let mes = 1; mes <= 12; mes++) {
      const m = meses[mes - 1];
      const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
      for (let d = 1; d <= dias; d++) {
        const helada = azar() < m.nochesHelada;
        const tMin = helada ? 2 - azar() * 3 : m.tMedia - m.amplitud / 2 + (azar() - 0.5);
        const tMax = m.tMedia + m.amplitud / 2 + (azar() - 0.5);
        out.push({
          fecha: anio + "-" + String(mes).padStart(2, "0") + "-" + String(d).padStart(2, "0"),
          tempMinC: tMin,
          tempMaxC: tMax,
          tempMediaC: m.tMedia + (azar() - 0.5) * 0.4,
          lluviaMm: m.lluvia / dias,
        });
      }
    }
  }
  return out;
}

const relojFijo = { hoy: () => new Date("2026-11-13T12:00:00Z") };

/** Perfil climático calculado por el caso de uso real con una serie sintética (sin red). */
export async function perfilSintetico(meses: MesSintetico[], latitud: number, altitudM: number): Promise<PerfilClimaticoDto> {
  const serie = serieSintetica(meses);
  const uc = new ObtenerPerfilClimaticoUseCase(
    { buscarPorId: () => Promise.resolve(null) } as never,
    { obtenerSerieDiaria: () => Promise.resolve(Result.ok({ fuente: "NASA POWER", altitudCeldaM: altitudM, registros: serie })) },
    { estacionMasCercana: () => Promise.resolve(Result.ok(null)) },
    relojFijo,
  );
  const r = await uc.porUbicacion({ latitud, longitud: -73, altitudM }, { origen: "script", ip: null });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** Altiplano bimodal tipo Duitama (≈ 2 530 m): lluvias de marzo a mayo y de septiembre a noviembre, heladas en dic–feb. */
export const MESES_DUITAMA: MesSintetico[] = [
  { tMedia: 13.6, amplitud: 13, lluvia: 30, nochesHelada: 0.2 },
  { tMedia: 14.0, amplitud: 13, lluvia: 45, nochesHelada: 0.15 },
  { tMedia: 14.5, amplitud: 11, lluvia: 85, nochesHelada: 0.03 },
  { tMedia: 14.6, amplitud: 10, lluvia: 125, nochesHelada: 0 },
  { tMedia: 14.5, amplitud: 9, lluvia: 110, nochesHelada: 0 },
  { tMedia: 14.0, amplitud: 9, lluvia: 60, nochesHelada: 0 },
  { tMedia: 13.6, amplitud: 9, lluvia: 50, nochesHelada: 0 },
  { tMedia: 13.8, amplitud: 10, lluvia: 55, nochesHelada: 0 },
  { tMedia: 14.0, amplitud: 10, lluvia: 85, nochesHelada: 0.02 },
  { tMedia: 14.3, amplitud: 10, lluvia: 135, nochesHelada: 0 },
  { tMedia: 14.2, amplitud: 11, lluvia: 100, nochesHelada: 0.03 },
  { tMedia: 13.7, amplitud: 13, lluvia: 45, nochesHelada: 0.15 },
];

/** Valor bruto de la producción por ha en Colombia (FAOSTAT 2018-2022), del mismo archivo que usa platform. */
const FAOSTAT = JSON.parse(Deno.readTextFileSync(new URL("../../../platform/data/faostat-cultivos.json", import.meta.url)));
export const VALOR_HA_COLOMBIA: Record<string, number> = Object.fromEntries(
  Object.entries(FAOSTAT.paises["170"] as Record<string, { valorHa: number | null }>).filter(([, v]) => v.valorHa !== null).map(([k, v]) => [k, v.valorHa as number]),
);

/** Presencia EVA medida en vivo (2026-11-13) alrededor de Duitama (5.785, -73.03). */
export const PRESENCIA_DUITAMA: PresenciaLocal = {
  fuente: "EVA",
  ambito: "Duitama y 17 municipios a menos de 25 km",
  periodo: "2015-2025",
  areaPorCultivo: {
    papa: 2909.4, cebolla_bulbo: 1522.5, maiz: 633.6, arveja: 358.5, tomate: 234, frijol: 198.5, avena: 106.3, cebada: 92, repollo: 68,
    trigo: 66.5, lechuga: 60.9, zanahoria: 34.5, haba: 33.8, remolacha: 17.7, quinua: 17.4, calabaza: 2.8, ajo: 2.4, pimiento: 0.6,
  },
  cultivosCubiertos: [
    "maiz", "trigo", "cebada", "avena", "centeno", "arroz", "sorgo", "mijo_perla", "amaranto", "quinua", "trigo_sarraceno", "frijol", "arveja",
    "haba", "garbanzo", "lenteja", "soya", "mani", "caupi", "gandul", "tarwi", "papa", "yuca", "batata", "oca", "remolacha", "zanahoria",
    "cebolla_bulbo", "ajo", "tomate", "repollo", "lechuga", "calabaza", "pepino", "pimiento", "girasol", "colza", "sesamo", "algodon", "lino",
  ],
  valorProduccionHaPais: VALOR_HA_COLOMBIA,
  pais: "Colombia",
};
