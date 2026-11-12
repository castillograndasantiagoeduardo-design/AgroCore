/**
 * Referencia CUALITATIVA de ingreso por cultivo (alta / media / baja).
 *
 * ⚠️ NO usa precios, costos ni rendimientos: es solo una referencia relativa de qué cultivos suelen
 * dejar más ingreso por hectárea en la zona. Esa limitación ya está declarada en VACIOS_GENERALES
 * ("No se usan precios ni costos"). Debe validarse con un agrónomo y con precios reales del mercado.
 */
export type NivelIngreso = "alta" | "media" | "baja";

export const PUNTAJE_INGRESO: Record<NivelIngreso, number> = { alta: 90, media: 60, baja: 30 };

export const REFERENCIA_INGRESO: Readonly<Record<string, NivelIngreso>> = {
  papa: "alta",
  cebolla_bulbo: "alta",
  arveja: "alta",
  haba: "media",
  quinua: "media",
  maiz: "media",
  raigras_trebol: "media",
  trigo: "baja",
  cebada: "baja",
  avena_vicia: "baja",
  tarwi: "baja",
};

/** Clave desconocida = media. */
export function nivelIngresoReferencia(clave: string): NivelIngreso {
  return REFERENCIA_INGRESO[clave] ?? "media";
}

export function puntajeIngresoReferencia(clave: string): number {
  return PUNTAJE_INGRESO[nivelIngresoReferencia(clave)];
}
