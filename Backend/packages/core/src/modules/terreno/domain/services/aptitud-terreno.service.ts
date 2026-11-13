/**
 * Aptitud del terreno para sembrar (servicio de dominio puro).
 *
 * El adaptador (Overpass) solo entrega GEOMETRÍAS; la decisión "es carretera" vive aquí:
 *
 *   Un punto está SOBRE una vía si su distancia al eje de la vía es menor que la mitad del ancho
 *   típico de ese tipo de vía (tabla ANCHO_TIPICO_VIA_M, valores documentados y ajustables).
 *
 * Para un ÁREA se muestrea una malla de puntos dentro del polígono: el % de puntos sobre vías,
 * edificaciones o agua es el % del área afectado, que se EXCLUYE del cálculo de rotaciones.
 * Si el área afectada supera UMBRAL_AREA_NO_APTA, todo el lote se declara no apto.
 *
 * Después se mira la cobertura MODIS (celda de 500 m): agua → no apto por agua; urbano, bosque o
 * nieve permanente → no apto por uso del suelo (con aviso de que la celda es gruesa).
 */
import { type AfectacionDto, type AptitudTerreno, MENSAJE_ES_CARRETERA, type ViaDetectadaDto } from "@agrocore/contracts";
import { type LatLon, distanciaAPolilineaM, puntoEnPoligono } from "../../../../shared/domain/geo/geometria.ts";
import type { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";
import type { ElementosOsm, ViaOsm } from "../../application/ports/index.ts";
import type { CategoriaCobertura } from "@agrocore/contracts";

/**
 * Ancho TOTAL típico de la calzada por tipo de vía OSM (highway=*), en metros.
 * Fuente: valores de referencia del plan AgroCore (motorway/trunk 12, primary 8, secondary 6,
 * tertiary/residential 4, track 2) completados con criterios habituales de OSM. Ajustables.
 * Un punto es carretera si está a menos de ANCHO/2 del eje.
 */
export const ANCHO_TIPICO_VIA_M: Readonly<Record<string, number>> = {
  motorway: 12,
  trunk: 12,
  motorway_link: 8,
  trunk_link: 8,
  primary: 8,
  primary_link: 6,
  secondary: 6,
  secondary_link: 5,
  tertiary: 4,
  tertiary_link: 4,
  residential: 4,
  unclassified: 4,
  living_street: 4,
  service: 3,
  road: 4,
  busway: 4,
  track: 2,
  path: 1,
  footway: 1,
  cycleway: 1.5,
  bridleway: 1,
  pedestrian: 3,
  steps: 1,
};
/** Para tipos de vía no listados (ej. "construction"). */
export const ANCHO_VIA_DESCONOCIDA_M = 3;
/** Semiancho de un río o canal mapeado como línea (m). */
export const SEMIANCHO_CAUCE_M: Readonly<Record<string, number>> = { river: 10, canal: 4 };

/** Si más de este % del área está afectado, todo el lote es no apto. */
export const UMBRAL_AREA_NO_APTA_PCT = 90;
/** Distancia para listar una vía como "cercana" aunque no afecte. */
export const DISTANCIA_VIA_CERCANA_M = 50;

/** Clases IGBP (MCD12Q1 LC_Type1) con nombre en español y categoría. */
export const CLASES_IGBP: Readonly<Record<number, { nombre: string; categoria: CategoriaCobertura }>> = {
  1: { nombre: "Bosque perennifolio de coníferas", categoria: "bosque" },
  2: { nombre: "Bosque perennifolio de latifoliadas", categoria: "bosque" },
  3: { nombre: "Bosque caducifolio de coníferas", categoria: "bosque" },
  4: { nombre: "Bosque caducifolio de latifoliadas", categoria: "bosque" },
  5: { nombre: "Bosque mixto", categoria: "bosque" },
  6: { nombre: "Matorral cerrado", categoria: "natural" },
  7: { nombre: "Matorral abierto", categoria: "natural" },
  8: { nombre: "Sabana arbolada", categoria: "natural" },
  9: { nombre: "Sabana", categoria: "natural" },
  10: { nombre: "Pastizal", categoria: "pastizal" },
  11: { nombre: "Humedal permanente", categoria: "agua" },
  12: { nombre: "Tierras de cultivo", categoria: "agricola" },
  13: { nombre: "Urbano y construido", categoria: "urbano" },
  14: { nombre: "Mosaico de cultivos y vegetación natural", categoria: "agricola" },
  15: { nombre: "Nieve y hielo permanentes", categoria: "nieve" },
  16: { nombre: "Suelo desnudo / árido", categoria: "arido" },
  17: { nombre: "Cuerpo de agua", categoria: "agua" },
};

export function semiAnchoVia(tipo: string): number {
  return (ANCHO_TIPICO_VIA_M[tipo] ?? ANCHO_VIA_DESCONOCIDA_M) / 2;
}

type Afectacion = "carretera" | "edificacion" | "agua" | null;

interface Clasificacion {
  afectacion: Afectacion;
  via: ViaOsm | null;
}

/** Qué hay en un punto: vía (la más cercana dentro de su semiancho), edificación, agua o nada. */
export function clasificarPunto(p: LatLon, elementos: ElementosOsm): Clasificacion {
  let mejorVia: ViaOsm | null = null;
  let mejorHolgura = Infinity;
  for (const via of elementos.vias) {
    const d = distanciaAPolilineaM(p, via.geometria);
    const holgura = d - semiAnchoVia(via.tipo);
    if (holgura < 0 && holgura < mejorHolgura) {
      mejorVia = via;
      mejorHolgura = holgura;
    }
  }
  if (mejorVia) return { afectacion: "carretera", via: mejorVia };
  if (elementos.edificaciones.some((anillo) => anillo.length >= 3 && puntoEnPoligono(p, anillo))) {
    return { afectacion: "edificacion", via: null };
  }
  if (elementos.aguaPoligonos.some((anillo) => anillo.length >= 3 && puntoEnPoligono(p, anillo))) {
    return { afectacion: "agua", via: null };
  }
  if (elementos.aguaLineas.some((l) => distanciaAPolilineaM(p, l.geometria) < (SEMIANCHO_CAUCE_M[l.tipo] ?? 2))) {
    return { afectacion: "agua", via: null };
  }
  return { afectacion: null, via: null };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface ResultadoAfectacion {
  afectacion: AfectacionDto;
  viasCercanas: ViaDetectadaDto[];
}

/** Muestrea el área y calcula qué fracción cae sobre vías, edificaciones o agua. */
export function evaluarAfectacion(area: AreaSeleccionada, elementos: ElementosOsm, ladoMalla = 12): ResultadoAfectacion {
  const puntos = area.puntosMuestreo(ladoMalla);
  const conteo = { carretera: 0, edificacion: 0, agua: 0 };
  const viasQueAfectan = new Set<ViaOsm>();
  for (const p of puntos) {
    const c = clasificarPunto(p, elementos);
    if (c.afectacion) conteo[c.afectacion]++;
    if (c.via) viasQueAfectan.add(c.via);
  }
  const pct = (n: number) => r1((100 * n) / puntos.length);

  // Vías a mostrar: las que afectan, más las cercanas al centro (máximo 5, la más cercana primero).
  const centro = area.centro;
  const candidatas = elementos.vias
    .map((via) => {
      const distanciaM = area.tipo === "punto" ? distanciaAPolilineaM(centro, via.geometria) : Math.min(
        ...[centro, ...area.anillo].map((p) => distanciaAPolilineaM(p, via.geometria)),
      );
      return { via, distanciaM };
    })
    .filter(({ via, distanciaM }) => viasQueAfectan.has(via) || distanciaM <= DISTANCIA_VIA_CERCANA_M)
    .sort((a, b) => a.distanciaM - b.distanciaM)
    .slice(0, 5);

  return {
    afectacion: {
      carreteraPct: pct(conteo.carretera),
      edificacionPct: pct(conteo.edificacion),
      aguaPct: pct(conteo.agua),
      excluidoPct: pct(conteo.carretera + conteo.edificacion + conteo.agua),
      puntosMuestreados: puntos.length,
    },
    viasCercanas: candidatas.map(({ via, distanciaM }) => ({
      tipo: via.tipo,
      nombre: via.nombre,
      distanciaM: r1(distanciaM),
      semiAnchoM: semiAnchoVia(via.tipo),
      geometria: via.geometria.map(([lat, lon]) => [lat, lon] as [number, number]),
    })),
  };
}

export interface DecisionAptitud {
  aptitud: AptitudTerreno;
  mensaje: string;
  advertencias: string[];
}

/**
 * Decide la aptitud con la afectación de OpenStreetMap (si se pudo consultar) y la cobertura MODIS.
 * `afectacion` null = no se pudo consultar OpenStreetMap: no se puede afirmar que sea apto ni que no.
 */
export function decidirAptitud(
  tipo: "punto" | "poligono",
  afectacion: AfectacionDto | null,
  categoriaCobertura: CategoriaCobertura | null,
  nombreCobertura: string | null,
): DecisionAptitud {
  const advertencias: string[] = [];

  if (afectacion) {
    const tipos: [AptitudTerreno, number, string][] = [
      ["no_apto_carretera", afectacion.carreteraPct, MENSAJE_ES_CARRETERA],
      ["no_apto_edificacion", afectacion.edificacionPct, "No se puede sembrar: es una edificación"],
      ["no_apto_agua", afectacion.aguaPct, "No se puede sembrar: es un cuerpo de agua"],
    ];
    if (tipo === "punto") {
      const bloqueo = tipos.find(([, pct]) => pct > 0);
      if (bloqueo) return { aptitud: bloqueo[0], mensaje: bloqueo[2], advertencias };
    } else if (afectacion.excluidoPct >= UMBRAL_AREA_NO_APTA_PCT) {
      const dominante = [...tipos].sort((a, b) => b[1] - a[1])[0];
      return {
        aptitud: dominante[0],
        mensaje: dominante[2] + " (" + afectacion.excluidoPct + " % del área está afectada)",
        advertencias,
      };
    }
  }

  if (categoriaCobertura === "agua") {
    return { aptitud: "no_apto_agua", mensaje: "No se puede sembrar: MODIS clasifica la zona como agua (" + nombreCobertura + ")", advertencias };
  }
  if (categoriaCobertura === "urbano" || categoriaCobertura === "bosque" || categoriaCobertura === "nieve") {
    return {
      aptitud: "no_apto_uso_suelo",
      mensaje: "No apto por uso del suelo: MODIS clasifica la celda como " + (nombreCobertura ?? categoriaCobertura).toLowerCase() +
        ". La celda mide 500 m: verifica en el terreno.",
      advertencias,
    };
  }

  let mensaje = "Apto para sembrar";
  if (afectacion && afectacion.excluidoPct > 0) {
    const partes: string[] = [];
    if (afectacion.carreteraPct > 0) partes.push(afectacion.carreteraPct + " % carretera");
    if (afectacion.edificacionPct > 0) partes.push(afectacion.edificacionPct + " % edificaciones");
    if (afectacion.aguaPct > 0) partes.push(afectacion.aguaPct + " % agua");
    mensaje = "Apto: se excluye el " + afectacion.excluidoPct + " % del área (" + partes.join(", ") + ")";
  }
  if (!afectacion) {
    advertencias.push(
      "No se pudo consultar OpenStreetMap: no se verificó si el sitio cae sobre una vía, una edificación o agua. Revísalo en el mapa.",
    );
  }
  return { aptitud: "apto", mensaje, advertencias };
}
