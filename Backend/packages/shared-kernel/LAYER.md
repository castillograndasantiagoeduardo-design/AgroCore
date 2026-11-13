# 🧱 Capa 0: `@agrocore/shared-kernel`

> Ruta: `Backend/packages/shared-kernel`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Es el cimiento más interno del sistema. **No depende de ningún paquete ni librería externa.**

## 📦 ¿Qué contiene?

- `Result<T, E>`: Mónada funcional (`Result.ok(valor)` o `Result.err(error)`) que reemplaza el uso de `throw` para errores de negocio.
- `DomainError`: Clase base inmutable con `code` (ej. `'STOCK_INSUFICIENTE'`) y `message`.
- `Pagination`: Tipos base para consultas paginadas.

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| *(Ninguno — TypeScript puro)* | Cualquier paquete o librería externa |

---

## 🚫 Restricciones de la Capa

- No agregar dependencias (ni npm, ni jsr, ni otros paquetes del workspace).
- Ninguna regla de negocio fallida lanza `throw`: se devuelve `Result.err(new DomainError('CODIGO', 'Mensaje'))` (Regla 3).
- `DomainError` es inmutable y no extiende `Error`.

---

## 🛠️ Forma de Uso

```typescript
import { Result, DomainError } from '@agrocore/shared-kernel';

if (stockActual < cantidadSolicitada) {
  return Result.err(new DomainError('STOCK_INSUFICIENTE', 'No hay unidades suficientes en la sucursal.'));
}
return Result.ok(stockActual - cantidadSolicitada);
```
