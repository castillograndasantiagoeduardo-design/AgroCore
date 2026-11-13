# 🧱 Capa 5A: `@agrocore/api` (Hono)

> Ruta: `Backend/apps/api`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Adaptador primario: puerta de entrada HTTP REST al Backend.

## 📦 ¿Qué contiene?

- `main.ts`: crea el contenedor, monta middlewares y rutas.
- `src/middlewares/proteccion.ts`: `contextoSolicitud` (origen "api" + IP) y `limitePeticiones` (límite por IP en memoria). CORS y tamaño máximo del body se montan en `main.ts`. La API es abierta: no hay login ni control de acceso.
- `src/routes/`: rutas Hono por módulo.
- `src/controllers/`: validan con Zod e invocan casos de uso desde `c.get('container')`.
- `src/http/safe-handler.ts` y `src/http/present-result.ts`.

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `composition`, `core` *(solo tipos/errores)*, `shared-kernel`, `Shared/contracts` | `database` (repositorios/Drizzle directo), `platform` directo |

---

## 🚫 Restricciones de la Capa

- Flujo: middlewares arman el `ContextoSolicitud` (y limitan peticiones en endpoints que llaman a proveedores externos) → el controlador valida `c.req.json()`/`c.req.query()` con un esquema de contracts → invoca el caso de uso desde `c.get('container')` → `presentResult(c, result)`.
- `presentResult` convierte los códigos de `DomainError` en HTTP semánticos (`404`, `409`, `422`, `403`, `200`, `201`).
- **Regla 4:** prohibido `new MySql...Repository(...)` o `new ...UseCase(...)` aquí.
- **Regla 5:** sin validaciones de negocio en el controlador; solo estructura con Zod.

---

## 🛠️ Forma de Uso

```typescript
crear: safeHandler(async (c) => {
  const parsed = CrearProductoSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return presentValidationError(c, parsed.error);
  const result = await c.get("container").crearProducto.execute(parsed.data, c.get("contexto"));
  return presentResult(c, result, 201);
}),
```
