/**
 * Un día de datos climáticos tal como lo entrega cualquier proveedor (NASA POWER, IDEAM...).
 * Los valores faltantes llegan como null (nunca como -999).
 */
export interface RegistroClimaDiario {
  /** Fecha en formato YYYY-MM-DD. */
  fecha: string;
  lluviaMm: number | null;
  tempMediaC: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
}

/** Serie diaria para un punto, con la altitud promedio de la celda del proveedor. */
export interface SerieClimatica {
  fuente: string;
  altitudCeldaM: number;
  registros: RegistroClimaDiario[];
}
