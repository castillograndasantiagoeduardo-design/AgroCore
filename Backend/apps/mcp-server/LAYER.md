# 🧱 Capa 5B: `@duitamacrece/mcp-server`

> Ruta: `Backend/apps/mcp-server`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Adaptador primario: expone los casos de uso como herramientas MCP para Agentes IA.

## 📦 ¿Qué contiene?

- `main.ts`: crea el contenedor, verifica `MCP_ACCESS_TOKEN` y conecta por stdio.
- `src/tool-gateway.ts`: `ToolGateway` valida el esquema Zod, comprueba el permiso del rol en sesión, ejecuta el caso de uso y registra en `logs_mcp_tools`.
- `src/tools/`: herramientas por módulo.

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `composition`, `core` *(solo tipos/errores)*, `shared-kernel`, `Shared/contracts` | `database` (repositorios/Drizzle directo), `platform` directo |

---

## 🚫 Restricciones de la Capa

- Toda herramienta se registra con `gateway.register(...)`; nunca con `server.tool` directo (se perdería validación, RBAC y log).
- Los nombres de herramientas salen de `MCP_TOOLS` en contracts.
- **Regla 4:** prohibido instanciar repositorios o casos de uso.

---

## 🛠️ Forma de Uso

```typescript
gateway.register({
  name: MCP_TOOLS.PRODUCTOS_CREAR,
  description: "Crea un producto.",
  schema: CrearProductoSchema,
  permission: PERMISSIONS.PRODUCTOS_CREAR,
  execute: (input, container, actor) => container.crearProducto.execute(input, actor),
});
```
