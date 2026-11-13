/**
 * Calendario de vulnerabilidad climática: por mes, qué amenaza hay y con qué fuerza (servicio de dominio puro).
 *
 * Amenazas y umbrales (documentados y ajustables):
 *   helada          probabilidad ≥ 0,1 → baja · ≥ 0,25 → media · ≥ 0,5 y ≥ 5 días → alta
 *   calor           días con Tmáx ≥ UMBRAL_CALOR_C: ≥ 1 → baja · ≥ 5 → media · ≥ 12 → alta
 *   deficit_hidrico lluvia / ET0: < 0,75 → baja · < 0,5 → media · < 0,25 → alta
 *   lluvia_extrema  días con lluvia ≥ 20 mm: ≥ 0,5 → baja · ≥ 1,5 → media · ≥ 3 → alta
 */
import type { AmenazaClimaticaDto, ClimaMensualDto, MesVulnerabilidadDto, SeveridadAmenaza } from "@agrocore/contracts";


import { UMBRAL_CALOR_C, UMBRAL_LLUVIA_FUERTE_MM } from "./calendario-climatico.service.ts";

type Escalon = [number, SeveridadAmenaza];

function severidad(valor: number, escalones: Escalon[], menorEsPeor = false): SeveridadAmenaza | null {
  // escalones ordenados de más grave a menos grave
  for (const [umbral, nivel] of escalones) {
    if (menorEsPeor ? valor < umbral : valor >= umbral) return nivel;
  }
  return null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function amenazasDelMes(m: ClimaMensualDto): AmenazaClimaticaDto[] {
  const out: AmenazaClimaticaDto[] = [];

  let helada: SeveridadAmenaza | null = null;
  if (m.probabilidadHelada >= 0.5 && m.diasHeladaPromedio >= 5) helada = "alta";
  else helada = severidad(m.probabilidadHelada, [[0.25, "media"], [0.1, "baja"]]);
  if (helada) {
    out.push({
      tipo: "helada",
      severidad: helada,
      detalle: "Helada en el " + Math.round(m.probabilidadHelada * 100) + " % de los años (" + r1(m.diasHeladaPromedio) + " días/mes en promedio).",
    });
  }

  const calor = severidad(m.diasCalorPromedio, [[12, "alta"], [5, "media"], [1, "baja"]]);
  if (calor) {
    out.push({
      tipo: "calor",
      severidad: calor,
      detalle: r1(m.diasCalorPromedio) + " días/mes con máxima ≥ " + UMBRAL_CALOR_C + " °C (Tmáx media " + m.tempMaxC + " °C).",
    });
  }

  if (m.etoMm > 0) {
    const ratio = m.lluviaMm / m.etoMm;
    const deficit = severidad(ratio, [[0.25, "alta"], [0.5, "media"], [0.75, "baja"]], true);
    if (deficit) {
      out.push({
        tipo: "deficit_hidrico",
        severidad: deficit,
        detalle: "Llueven " + Math.round(m.lluviaMm) + " mm y la demanda (ET0) es " + Math.round(m.etoMm) + " mm: balance " +
          Math.round(m.balanceHidricoMm) + " mm.",
      });
    }
  }

  const extrema = severidad(m.diasLluviaFuertePromedio, [[3, "alta"], [1.5, "media"], [0.5, "baja"]]);
  if (extrema) {
    out.push({
      tipo: "lluvia_extrema",
      severidad: extrema,
      detalle: r1(m.diasLluviaFuertePromedio) + " días/mes con lluvia ≥ " + UMBRAL_LLUVIA_FUERTE_MM + " mm (escorrentía y erosión).",
    });
  }
  return out;
}

const PESO: Record<SeveridadAmenaza, number> = { baja: 1, media: 2, alta: 3 };

export function calcularCalendarioVulnerabilidad(meses: readonly ClimaMensualDto[]): MesVulnerabilidadDto[] {
  return meses.map((m) => {
    const amenazas = amenazasDelMes(m);
    const maxima = amenazas.reduce<SeveridadAmenaza | null>(
      (acc, a) => (acc === null || PESO[a.severidad] > PESO[acc] ? a.severidad : acc),
      null,
    );
    return { mes: m.mes, nombreMes: m.nombreMes, amenazas, severidadMaxima: maxima };
  });
}
