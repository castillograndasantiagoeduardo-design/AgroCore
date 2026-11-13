# 🧱 Capa 4: `@agrocore/composition`

> Ruta: `Backend/packages/composition`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Es el **Composition Root**. Es el **único paquete** que conoce a `core`, `database` y `platform` simultáneamente.

## 📦 ¿Qué contiene?

- `createContainer(config)`: instancia el pool de MySQL, los repositorios y los servicios de plataforma e inyecta todo dentro de los casos de uso.
- `AppContainer`: tipo del contenedor listo para `apps/api` y `apps/mcp-server`.
- `loadConfigFromEnv()`: lee la configuración del entorno (Fail-Fast).

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `core`, `database`, `platform`, `shared-kernel`, `Shared/contracts` | `api`, `mcp-server`, `Frontend` |

---

## 🚫 Restricciones de la Capa

- **No contiene ni una sola línea de lógica de negocio.**
- **Regla 4:** todo caso de uso se registra en `src/container.ts` y se consume ya ensamblado.

---

## 🛠️ Forma de Uso

```typescript
export function createContainer(config: AppConfig) {
  const db = createDatabase(config.db);
  const auditor = new MySqlAuditor(db);
  const unitOfWork = new MySqlUnitOfWork(db);
  const productoRepository = new MySqlProductoRepository(db);

  return {
    crearProducto: new CrearProductoUseCase(productoRepository, unitOfWork, auditor),
  };
}
```
