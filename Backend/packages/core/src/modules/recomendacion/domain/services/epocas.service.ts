/**
 * Épocas del año DERIVADAS del clima del lugar (servicio de dominio puro). Sirve en cualquier hemisferio y régimen.
 *
 * Cada mes recibe UN tipo, en este orden de prioridad (el primero que se cumple):
 *   invierno  temperatura media < TEMP_MINIMA_CRECIMIENTO_C (casi ningún cultivo crece)
 *   heladas   helada frecuente: probabilidad ≥ PROBABILIDAD_RIESGO_HELADA y ≥ DIAS_HELADA_EXPOSICION días
 *   seca      lluvia < FRACCION_DEFICIT × ET0 (déficit de agua)
 *   calor     ≥ DIAS_CALOR_MES_CRITICO días con máxima ≥ UMBRAL_CALOR_C
 *   lluviosa  lluvia ≥ promedio mensual del año
 *   templada  el resto (sin lluvias fuertes, sin heladas ni calor)
 * Los meses seguidos del mismo tipo forman una época (el año es circular: diciembre sigue a enero).
 * Una época "templada" de un solo mes se une a la anterior para no fragmentar el calendario.
 *
 * Todas las cifras de los textos salen de los datos de la época (DatoConFuente); ninguna está escrita a mano.
 */
import type { DatoConFuente, EpocaDto, PerfilClimaticoDto, TipoEpoca } from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";
import { TEMP_MINIMA_CRECIMIENTO_C } from "../../../clima/domain/services/temporadas-cultivo.service.ts";
import { mesesHeladaFrecuente } from "../../../rotaciones/domain/services/evaluar-paso.service.ts";

/** Origen del clima: la serie diaria es medida; la climatología mensual deja helada y calor como estimados. */
export type OrigenClima = "serie_diaria" | "climatologia";

const ETIQUETA: Record<TipoEpoca, string> = {
  lluviosa: "Lluvias",
  seca: "Época seca",
  heladas: "Heladas",
  calor: "Calor",
  invierno: "Invierno",
  templada: "Tiempo templado",
};

const mesMinuscula = (m: number) => NOMBRES_MES[m - 1].toLowerCase();
const r1 = (v: number) => Math.round(v * 10) / 10;
const fmt = (v: number | null) => (v === null ? "sin dato" : String(r1(v)).replace(".", ","));

export function tipoDeMes(perfil: PerfilClimaticoDto, mes: number): TipoEpoca {
  const m = perfil.meses[mes - 1];
  const promedioLluvia = perfil.meses.reduce((s, x) => s + x.lluviaMm, 0) / 12;
  if (m.tempMediaC < TEMP_MINIMA_CRECIMIENTO_C) return "invierno";
  if (mesesHeladaFrecuente(perfil).includes(mes)) return "heladas";
  if (perfil.resumen.mesesDeficitHidrico.includes(mes)) return "seca";
  if (perfil.resumen.mesesCalor.includes(mes)) return "calor";
  if (m.lluviaMm >= promedioLluvia) return "lluviosa";
  return "templada";
}

/** Agrupa los 12 meses en tramos circulares del mismo tipo. */
function agrupar(tipos: TipoEpoca[]): { tipo: TipoEpoca; meses: number[] }[] {
  if (tipos.every((t) => t === tipos[0])) return [{ tipo: tipos[0], meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }];
  // Empezar en un mes donde cambia el tipo para que ningún tramo quede partido entre diciembre y enero.
  let inicio = 0;
  while (tipos[inicio] === tipos[(inicio + 11) % 12]) inicio++;
  const tramos: { tipo: TipoEpoca; meses: number[] }[] = [];
  for (let k = 0; k < 12; k++) {
    const i = (inicio + k) % 12;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.tipo === tipos[i]) ultimo.meses.push(i + 1);
    else tramos.push({ tipo: tipos[i], meses: [i + 1] });
  }
  // Unir épocas templadas de un mes a la anterior.
  for (let i = tramos.length - 1; i >= 0 && tramos.length > 1; i--) {
    if (tramos[i].tipo === "templada" && tramos[i].meses.length === 1) {
      const anterior = tramos[(i - 1 + tramos.length) % tramos.length];
      anterior.meses.push(...tramos[i].meses);
      tramos.splice(i, 1);
    }
  }
  return tramos.sort((a, b) => a.meses[0] - b.meses[0]);
}

function nombreEpoca(tipo: TipoEpoca, meses: number[]): string {
  if (meses.length === 12) return ETIQUETA[tipo] + " todo el año";
  if (meses.length === 1) return ETIQUETA[tipo] + " en " + mesMinuscula(meses[0]);
  return ETIQUETA[tipo] + " de " + mesMinuscula(meses[0]) + " a " + mesMinuscula(meses[meses.length - 1]);
}

function queOcurre(tipo: TipoEpoca, d: EpocaDto["datos"], mesesN: number, hayHelada: boolean): string {
  const lluviaMes = d.lluviaMm.valor === null ? null : d.lluviaMm.valor / mesesN;
  const helada = hayHelada ? "puede helar" : "no hay heladas";
  switch (tipo) {
    case "lluviosa":
      return "Llueve bien (unos " + fmt(lluviaMes) + " mm al mes) y " + helada + ".";
    case "seca":
      return "Llueve poco (unos " + fmt(lluviaMes) + " mm al mes) y el cultivo pierde más agua de la que cae.";
    case "heladas":
      return "Hay heladas frecuentes (unos " + fmt(d.diasHelada.valor) + " días con helada en la época).";
    case "calor":
      return "Hace calor fuerte (unos " + fmt(d.diasCalor.valor) + " días muy calurosos en la época).";
    case "invierno":
      return "Hace frío: la temperatura media ronda los " + fmt(d.tempMediaC.valor) + " °C y casi nada crece.";
    case "templada":
      return "Tiempo templado (" + fmt(d.tempMediaC.valor) + " °C de media) con lluvias moderadas; " + helada + ".";
  }
}

export function derivarEpocas(perfil: PerfilClimaticoDto, origen: OrigenClima): EpocaDto[] {
  const tipos = Array.from({ length: 12 }, (_, i) => tipoDeMes(perfil, i + 1));
  const helada = mesesHeladaFrecuente(perfil);
  const calibrado = perfil.calibracion !== null;
  const fecha = perfil.periodo.desde.slice(0, 4) + "-" + perfil.periodo.hasta.slice(0, 4);
  const notaFuente = calibrado ? "Calibrado con la estación IDEAM " + perfil.calibracion!.estacion : undefined;
  const dato = (valor: number, unidad: string, tipo: DatoConFuente<number>["tipo"], nota?: string): DatoConFuente<number> => ({
    valor: r1(valor),
    unidad,
    fuente: "NASA_POWER",
    tipo,
    fecha,
    ...(nota ?? notaFuente ? { nota: nota ?? notaFuente } : {}),
  });
  const estimado = origen === "climatologia";

  return agrupar(tipos).map((t, i) => {
    const ms = t.meses.map((m) => perfil.meses[m - 1]);
    const datos: EpocaDto["datos"] = {
      lluviaMm: dato(ms.reduce((s, m) => s + m.lluviaMm, 0), "mm", "medido"),
      etoMm: dato(ms.reduce((s, m) => s + m.etoMm, 0), "mm", "calculado", "Evapotranspiración de referencia (Hargreaves, FAO-56)"),
      tempMediaC: dato(ms.reduce((s, m) => s + m.tempMediaC, 0) / ms.length, "°C", "medido"),
      tempMinC: dato(Math.min(...ms.map((m) => m.tempMinC)), "°C", "medido"),
      diasHelada: dato(ms.reduce((s, m) => s + m.diasHeladaPromedio, 0), "días", estimado ? "estimado" : "calculado", estimado ? "Aproximado con la climatología mensual de NASA" : undefined),
      diasCalor: dato(ms.reduce((s, m) => s + m.diasCalorPromedio, 0), "días", estimado ? "estimado" : "calculado", estimado ? "Aproximado con la climatología mensual de NASA" : undefined),
    };
    return {
      id: "e" + (i + 1),
      tipo: t.tipo,
      nombre: nombreEpoca(t.tipo, t.meses),
      meses: t.meses,
      queOcurre: queOcurre(t.tipo, datos, t.meses.length, t.meses.some((m) => helada.includes(m))),
      datos,
    };
  });
}
