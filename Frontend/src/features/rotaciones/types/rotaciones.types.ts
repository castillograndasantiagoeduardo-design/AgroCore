/**
 * Tipos de vista del módulo rotaciones.
 */
import type { PrioridadRotacion, ReglaRotacion } from "@agrocore/contracts";

export const ETIQUETA_PRIORIDAD: Record<PrioridadRotacion, string> = {
  agua: "Ahorrar agua",
  suelo: "Cuidar el suelo",
  plagas: "Reducir plagas y enfermedades",
  forraje: "Producir forraje",
  ingreso: "Ingreso",
};

export const ETIQUETA_REGLA: Record<ReglaRotacion, string> = {
  no_repetir_familia: "No repite la misma familia de cultivos seguida",
  leguminosa_cada_dos_anios: "Incluye una leguminosa (fija nitrógeno)",
  siembra_inicio_lluvias: "Siembra al inicio de lluvias",
  evitar_helada: "Evita la helada",
  altitud_apta: "Cultivos aptos a la altitud",
  agua_suficiente: "Agua suficiente (lluvia o riego)",
  ciclo_cabe_en_ventana: "El ciclo cabe antes de la siguiente siembra",
};

export const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** 1..12 → "enero".."diciembre". */
export function nombreMes(mes: number): string {
  return NOMBRE_MES[mes - 1] ?? String(mes);
}

/** [1, 2, 12] → "enero, febrero, diciembre" (o "ninguno"). */
export function listaMeses(meses: number[]): string {
  return meses.length === 0 ? "ninguno" : meses.map(nombreMes).join(", ");
}
