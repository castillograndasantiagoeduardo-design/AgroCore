/**
 * Normal climatológica de una estación del IDEAM: promedio oficial de 30 años por mes.
 * Es la "verdad de terreno" contra la que calibramos NASA POWER.
 */
export interface NormalMensual {
  mes: number; // 1..12
  lluviaMm: number;
  tempMinC: number;
  tempMediaC: number;
  tempMaxC: number;
}

export interface NormalClimatologica {
  fuente: string;
  codigoEstacion: string;
  estacion: string;
  municipio: string;
  latitud: number;
  longitud: number;
  altitudM: number;
  /** Años que cubre la normal, ej. 1991 y 2020. */
  anioInicio: number;
  anioFin: number;
  meses: NormalMensual[]; // siempre 12, ordenados
}
