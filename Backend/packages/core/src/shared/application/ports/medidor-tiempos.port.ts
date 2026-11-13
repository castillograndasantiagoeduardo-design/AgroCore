/**
 * Puerto IMedidorTiempos: mide cuánto tarda cada proveedor y el motor dentro de una petición
 * (cabecera Server-Timing de la API y scripts/medir-tiempos.ts).
 *
 * core no usa relojes (Regla 2): solo envuelve las tareas con etiquetas. La implementación real
 * (MedidorTiemposAls, @agrocore/platform) usa performance.now() y AsyncLocalStorage.
 */
export const ETIQUETAS_TIEMPO = [
  "power_sitio",
  "power_climatologia",
  "power_estacion",
  "ideam",
  "modis_ndvi",
  "modis_cobertura",
  "overpass",
  "soilgrids",
  "srtm",
  "power_humedad",
  "precalculo",
  "mysql",
  "motor",
  "serializacion",
] as const;
export type EtiquetaTiempo = (typeof ETIQUETAS_TIEMPO)[number];

export interface IMedidorTiempos {
  medir<T>(etiqueta: EtiquetaTiempo, tarea: () => Promise<T>): Promise<T>;
  medirSync<T>(etiqueta: EtiquetaTiempo, tarea: () => T): T;
}

/** Medidor que no mide (tests y casos de uso sin instrumentar). */
export const MEDIDOR_NULO: IMedidorTiempos = {
  medir: (_etiqueta, tarea) => tarea(),
  medirSync: (_etiqueta, tarea) => tarea(),
};
