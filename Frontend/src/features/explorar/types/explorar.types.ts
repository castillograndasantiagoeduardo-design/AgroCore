/**
 * Tipos de vista y constantes de presentación del módulo explorar (sin lógica de negocio).
 */
import type {
  AreaSeleccionadaDto,
  ComparacionRotacionesDto,
  PerfilTerrenoDto,
  PrioridadRotacion,
  PrioridadesRotacion,
  ReglaRotacion,
} from "@agrocore/contracts";

export const ETIQUETA_PRIORIDAD: Record<PrioridadRotacion, string> = {
  agua: "Ahorrar agua",
  suelo: "Cuidar el suelo",
  plagas: "Reducir plagas",
  forraje: "Producir forraje",
  ingreso: "Ingreso",
};

export const ETIQUETA_REGLA: Record<ReglaRotacion, string> = {
  no_sembrar_en_carretera: "No se siembra sobre carretera",
  no_repetir_familia: "No repite la misma familia seguida",
  leguminosa_cada_dos_anios: "Incluye una leguminosa (fija nitrógeno)",
  siembra_en_temporada: "Siembra en temporada de cultivo",
  temperatura_apta: "Temperatura del ciclo apta",
  evitar_helada: "Evita la helada",
  tolerancia_calor: "Tolera el calor del ciclo",
  agua_suficiente: "Agua suficiente (lluvia o riego)",
  ciclo_cabe_en_ventana: "El ciclo cabe en la ventana",
  suelo_compatible: "Suelo compatible (pH y textura)",
  cobertura_en_pendiente: "Cobertura en pendiente",
  aprovechar_baldio: "Aprovecha los meses baldíos",
};

export const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** 1..12 → "enero".."diciembre". */
export function nombreMes(mes: number): string {
  return NOMBRE_MES[mes - 1] ?? String(mes);
}

/** 1..12 → "Ene".."Dic". */
export function mesCorto(mes: number): string {
  return MES_CORTO[mes - 1] ?? String(mes);
}

/** [1, 2, 12] → "enero, febrero, diciembre" (o "ninguno"). */
export function listaMeses(meses: number[]): string {
  return meses.length === 0 ? "ninguno" : meses.map(nombreMes).join(", ");
}

export interface PresetPrioridades {
  id: string;
  nombre: string;
  valores: PrioridadesRotacion;
}

export const PRESETS_PRIORIDADES: PresetPrioridades[] = [
  { id: "equilibrado", nombre: "Equilibrado", valores: { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 } },
  { id: "suelo", nombre: "Cuidar el suelo", valores: { agua: 2, suelo: 5, plagas: 4, forraje: 1, ingreso: 2 } },
  { id: "agua", nombre: "Ahorrar agua", valores: { agua: 5, suelo: 3, plagas: 3, forraje: 2, ingreso: 2 } },
  { id: "forraje", nombre: "Lechería/forraje", valores: { agua: 2, suelo: 3, plagas: 3, forraje: 5, ingreso: 3 } },
  { id: "ingreso", nombre: "Más ingreso", valores: { agua: 2, suelo: 2, plagas: 3, forraje: 2, ingreso: 5 } },
];

/** Lo que el usuario configura en el formulario (además del área del mapa). */
export interface EntradaSitio {
  cultivoActual: string;
  secuenciaActual?: string[];
  tieneRiego: boolean;
  prioridades: PrioridadesRotacion;
  altitudM?: number;
}

export type FaseExplorar = "inactivo" | "terreno" | "clima" | "listo" | "no_apto" | "error";

export interface EstadoExplorar {
  fase: FaseExplorar;
  area: AreaSeleccionadaDto | null;
  perfil: PerfilTerrenoDto | null;
  comparacion: ComparacionRotacionesDto | null;
  error: string | null;
  codigoError: string | null;
  segundos: number;
}

/** Fuentes que se muestran (en rotación) mientras se espera cada etapa. */
export const FUENTES_TERRENO = ["OpenStreetMap (vías y edificaciones)", "MODIS (NDVI y cobertura)", "SRTM (elevación y pendiente)", "SoilGrids (suelo)"];
export const FUENTES_CLIMA = ["NASA POWER (30 años de temperatura y lluvia)", "Evapotranspiración (Hargreaves)", "Temporadas y calendario de vulnerabilidad", "Estrategias de rotación"];
