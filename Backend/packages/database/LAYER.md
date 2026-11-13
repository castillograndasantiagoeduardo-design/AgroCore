# 🧱 Capa 3A: `@agrocore/database`

> Ruta: `Backend/packages/database`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Adaptador secundario. Habla con **MySQL 8.0** mediante **Drizzle ORM** y `mysql2/promise`, implementando los puertos de `core` (DIP).

## 📦 ¿Qué contiene?

- `schema/`: Definición de las tablas en Drizzle.
- `repositories/`: Clases `MySql<Entidad>Repository` que implementan `I<Entidad>Repository`, más `MySqlAuditor` y `MySqlMcpToolLogger`.
- `mappers/`: Traducen filas planas de SQL a Entidades ricas de `core` y viceversa (`toDomain`, `toPersistence`).
- `MySqlCacheProveedores` (`repositories/mysql-cache-proveedores.ts`, tabla `cache_proveedores`): caché persistente con TTL de las respuestas de proveedores externos (implementa `ICacheProveedores`). Atrapa sus propios errores: nunca tumba una consulta.
- Migraciones SQL: viven en `Docs/migraciones/` y las aplica `Backend/scripts/aplicar-migraciones.ts` (idempotente, registra en `migraciones_aplicadas`). `Docs/ddl.sql` es el esquema final para crear la base desde cero.
- `unit-of-work.ts`: Implementa `IUnitOfWork` con transacciones reales (`BEGIN`, `COMMIT`, `ROLLBACK`).
- `catalogos/`: Catálogos de referencia de solo lectura versionados en código (ej. `CatalogoCultivosEnMemoria`). Implementan el mismo puerto que tendría un repositorio MySQL y validan sus datos con las entidades de `core` al construirse (Fail-Fast).

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `core`, `shared-kernel`, `drizzle-orm`, `mysql2` | `platform`, `composition`, `api`, `mcp-server` |

---

## 🚫 Restricciones de la Capa

- Los repositorios usan `dbActual(this.db)` para participar en la transacción del `IUnitOfWork`.
- `try/catch` solo para fallos técnicos (caída de red MySQL) — Regla 3.
- **Regla 7:** `logs_auditoria` (y `movimientos_inventario`) son append-only; nunca `UPDATE`/`DELETE`. Las correcciones se hacen insertando un movimiento inverso.
- `MySqlAuditor` siempre pasa los detalles por `sanitizarDetalles` (Regla 6).

---

## 🛠️ Forma de Uso

```typescript
export class MySqlProductoRepository implements IProductoRepository {
  constructor(private readonly db: Database) {}

  async buscarPorId(id: number): Promise<Producto | null> {
    const [row] = await dbActual(this.db).select().from(productosTable).where(eq(productosTable.id, id)).limit(1);
    return row ? ProductoMapper.toDomain(row) : null;
  }
}
```
