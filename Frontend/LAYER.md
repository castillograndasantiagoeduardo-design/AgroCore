# 🧱 Capa 6: `Frontend/` (Next.js 16 — Arquitectura por Features)

> Ruta: `Frontend`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Completamente desacoplado del Backend: solo se comunica por HTTP y comparte esquemas vía `@duitamacrece/contracts`.

## 📦 ¿Qué contiene?

- `src/app/`: Solo define las páginas del App Router (`(autenticacion)`, `(panel)`, `(punto-de-venta)`) y delega el renderizado a `src/features/`.
- `src/features/<modulo>/`: `api/` (llamadas a `http-client.ts` tipadas con contracts), `hooks/` (estado, paginación, mutaciones), `components/` (tablas, modales, vistas), `types/` (tipos de vista).
- `src/components/ui/`: Sistema de diseño reutilizable.
- `src/lib/`: `http-client.ts` (con renovación automática de `refresh_token`) y formateadores.

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `Shared/contracts`, librerías React/Next.js | **Cualquier paquete de `Backend/`** |

---

## 🚫 Restricciones de la Capa

- Toda llamada HTTP pasa por `src/lib/http-client.ts`.
- Las páginas de `src/app/` no contienen lógica: importan componentes de `src/features/`.
- Validar formularios con los esquemas de contracts antes de enviar.

---

## 🛠️ Forma de Uso

```typescript
export const productosApi = {
  listar: (page = 1) => httpClient.get<PaginaProductos>("/api/productos?page=" + page),
  crear: (input: CrearProductoInput) => httpClient.post<ProductoDto>("/api/productos", input),
};
```
