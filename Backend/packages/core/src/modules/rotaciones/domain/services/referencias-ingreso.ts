/**
 * Referencia CUALITATIVA de ingreso por cultivo (alta / media / baja / ninguna).
 *
 * ⚠️ NO usa precios, costos ni rendimientos: es solo una referencia relativa de qué cultivos suelen dejar
 * más ingreso por hectárea. Esa limitación ya está declarada en VACIOS_GENERALES ("No se usan precios ni
 * costos"). Debe validarse con un agrónomo y con precios reales del mercado local.
 *
 * Por grupo (cuando el cultivo no tiene una referencia propia): hortalizas, tubérculos e industriales → alta;
 * leguminosas de grano, oleaginosas, pseudocereales y forrajes → media; cereales → baja; coberturas → ninguna.
 */
import type { GrupoCultivo } from "@agrocore/contracts";

export type NivelIngreso = "alta" | "media" | "baja" | "ninguna";

export const PUNTAJE_INGRESO: Record<NivelIngreso, number> = { alta: 90, media: 60, baja: 30, ninguna: 0 };

/** Excepciones a la regla por grupo. */
export const REFERENCIA_INGRESO: Readonly<Record<string, NivelIngreso>> = {
  arveja: "alta",
  frijol: "alta",
  quinua: "media",
  maiz: "media",
  arroz: "media",
  soya: "media",
  algodon: "alta",
  yuca: "media",
  avena_vicia: "baja",
  tarwi: "baja",
  centeno: "baja",
  mijo_perla: "baja",
};

const POR_GRUPO: Record<GrupoCultivo, NivelIngreso> = {
  hortaliza: "alta",
  tuberculo: "alta",
  industrial: "alta",
  leguminosa: "media",
  oleaginosa: "media",
  pseudocereal: "media",
  forraje: "media",
  cereal: "baja",
  cobertura: "ninguna",
};

export function nivelIngresoReferencia(clave: string, grupo: GrupoCultivo): NivelIngreso {
  return REFERENCIA_INGRESO[clave] ?? POR_GRUPO[grupo];
}

export function puntajeIngresoReferencia(clave: string, grupo: GrupoCultivo): number {
  return PUNTAJE_INGRESO[nivelIngresoReferencia(clave, grupo)];
}
