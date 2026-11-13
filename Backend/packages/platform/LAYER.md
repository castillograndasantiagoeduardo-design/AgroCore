# 🧱 Capa 3B: `@duitamacrece/platform`

> Ruta: `Backend/packages/platform`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Adaptador secundario. Provee implementaciones de criptografía, red, correo e IA para los puertos de `core`.

## 📦 ¿Qué contiene?

- `NasaPowerClient`, `IdeamNormalesClient`, `SistemaReloj` y los clientes de proveedores externos (Overpass, ORNL MODIS, SoilGrids, OpenTopoData) e impresora ESC/POS.
- Cada adaptador implementa un puerto de `core` y traduce los fallos técnicos a `Result.err(DomainError)`.

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `core`, `shared-kernel`, `Shared/contracts` | `database`, `composition`, `api`, `mcp-server` |

---

## 🚫 Restricciones de la Capa

- Cada servicio implementa un puerto definido en `core` (nunca al revés).
- `try/catch` solo para fallos técnicos (timeout, HTTP 5xx, JSON inválido) y se traducen a `Result.err(DomainError)`.
- No lee `Deno.env`: recibe su configuración por constructor desde `composition`.

---

## 🛠️ Forma de Uso

```typescript
export class NasaPowerClient implements IClimaProvider {
  async obtenerSerieDiaria(consulta: ConsultaSerie): Promise<Result<SerieClimatica, DomainError>> {
    try {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!respuesta.ok) return Result.err(new ClimaProveedorNoDisponibleError("NASA POWER", "HTTP " + respuesta.status));
      return Result.ok(convertir(await respuesta.json()));
    } catch (error) {
      return Result.err(new ClimaProveedorNoDisponibleError("NASA POWER", String(error)));
    }
  }
}
```
