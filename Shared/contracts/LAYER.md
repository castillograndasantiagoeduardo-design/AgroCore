# 🧱 Capa 1: `@duitamacrece/contracts`

> Ruta: `Shared/contracts`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Es el **idioma común** entre el Frontend, la API REST, el servidor MCP y el Core. **Solo depende de `zod`.**

## 📦 ¿Qué contiene?

- Esquemas de validación de entrada (`Crear<Entidad>Schema`, `Listar<Modulo>QuerySchema`).
- Tipos inferidos con `z.infer<typeof Schema>` (DTOs).
- Catálogo oficial de roles (`ROLES`), permisos (`PERMISSIONS`), acciones de auditoría (`AUDIT_ACTIONS`) y nombres de herramientas MCP (`MCP_TOOLS`).

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `zod` | `core`, `database`, `platform`, `api`, `Frontend` |

---

## 🚫 Restricciones de la Capa

- `contracts` valida la **forma** del dato; `core` valida las **reglas de negocio**. No mezclar.
- Ningún dato externo entra a un caso de uso sin pasar por un esquema de este paquete (Regla 5).
- Todo permiso nuevo se agrega en `permissions.ts` y toda acción auditable en `auditoria.catalogo.ts`.

---

## 🛠️ Forma de Uso

```typescript
import { CrearProductoSchema } from '@duitamacrece/contracts';

const parsed = CrearProductoSchema.safeParse(body);
if (!parsed.success) return presentValidationError(c, parsed.error);
```
