/**
 * Implementación de ICacheProveedores sobre cache_proveedores.
 * La caché nunca tumba una consulta: cualquier error se registra (una vez por tipo) y se ignora.
 */
import type { ICacheProveedores } from "@agrocore/core";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../connection.ts";
import { cacheProveedoresTable } from "../schema/index.ts";
import { dbActual } from "../unit-of-work.ts";

export class MySqlCacheProveedores implements ICacheProveedores {
  private readonly erroresAvisados = new Set<string>();

  constructor(private readonly db: Database) {}

  async obtener<T>(clave: string): Promise<T | null> {
    try {
      const [fila] = await dbActual(this.db)
        .select({ valor: cacheProveedoresTable.valor })
        .from(cacheProveedoresTable)
        .where(and(eq(cacheProveedoresTable.clave, clave), gt(cacheProveedoresTable.expiraEn, sql`NOW()`)))
        .limit(1);
      if (!fila) return null;
      // mysql2 puede devolver el JSON ya parseado o como texto.
      const valor = typeof fila.valor === "string" ? JSON.parse(fila.valor) : fila.valor;
      return (valor ?? null) as T | null;
    } catch (error) {
      this.avisar("obtener", error);
      return null;
    }
  }

  async guardar(clave: string, proveedor: string, valor: unknown, ttlDias: number): Promise<void> {
    try {
      const dias = Math.max(1, Math.floor(ttlDias));
      const expiraEn = sql`NOW() + INTERVAL ${dias} DAY`;
      await dbActual(this.db)
        .insert(cacheProveedoresTable)
        .values({ clave, proveedor, valor, expiraEn: expiraEn as unknown as Date })
        .onDuplicateKeyUpdate({ set: { valor, proveedor, expiraEn: expiraEn as unknown as Date } });
    } catch (error) {
      this.avisar("guardar", error);
    }
  }

  /** Un solo aviso por tipo de error para no inundar la consola. */
  private avisar(operacion: string, error: unknown): void {
    const nombre = error instanceof Error ? error.name : "Error";
    const causa = (error as { code?: string })?.code ?? "";
    const tipo = `${operacion}:${nombre}:${causa}`;
    if (this.erroresAvisados.has(tipo)) return;
    this.erroresAvisados.add(tipo);
    const mensaje = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
    console.warn(`[cache_proveedores] ${operacion} falló (se ignora, la caché es opcional): ${mensaje}`);
  }
}
