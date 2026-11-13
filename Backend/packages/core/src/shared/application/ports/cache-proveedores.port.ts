/**
 * Puerto ICacheProveedores: caché persistente de respuestas de proveedores externos
 * (NASA POWER, ORNL MODIS, Overpass, SoilGrids, OpenTopoData).
 *
 * Lo implementa MySqlCacheProveedores (@agrocore/database, tabla cache_proveedores) y lo reciben
 * los adaptadores de @agrocore/platform por constructor (se ensamblan en composition).
 * Una caché que falla NUNCA debe tumbar la consulta: las implementaciones atrapan sus errores
 * y devuelven null / no guardan.
 */
export interface ICacheProveedores {
  /** Valor guardado y vigente para la clave, o null. */
  obtener<T>(clave: string): Promise<T | null>;
  /** Guarda el valor por `ttlDias` días. */
  guardar(clave: string, proveedor: string, valor: unknown, ttlDias: number): Promise<void>;
}
