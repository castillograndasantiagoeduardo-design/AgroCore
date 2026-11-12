# 🧱 Capa 2: `@duitamacrece/core`

> Ruta: `Backend/packages/core`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Es el **corazón del software**. Cada módulo en `src/modules/<modulo>/` se divide en `domain/` (entities, value-objects, errors, services, repositories) y `application/` (ports, use-cases).

## 📦 ¿Qué contiene?

- `domain/entities`: Entidades con identidad e invariantes de negocio.
- `domain/value-objects`: Objetos de valor inmutables.
- `domain/errors`: Errores específicos del módulo (extienden `DomainError`).
- `domain/services`: Servicios de dominio puros (ej. `sanitizarDetalles`).
- `domain/repositories`: Interfaces (Puertos) de persistencia (`I<Entidad>Repository`).
- `application/ports`: Interfaces hacia servicios técnicos (`ITokenService`, `IUnitOfWork`, `IAuditor`).
- `application/use-cases`: Casos de Uso (1 clase = 1 acción o flujo del sistema).
- `tests/`: Tests unitarios de casos de uso con adaptadores en memoria.

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `shared-kernel`, `Shared/contracts` | `database` (Drizzle/MySQL), `platform` (JWT/Argon2), `api` (Hono), `composition` |

---

## 🚫 Restricciones de la Capa

- **Regla 2:** prohibido importar `drizzle-orm`, `mysql2`, `hono`, `jose`, `argon2`, `nodemailer` o usar `Deno.env`. Para correo, tokens, hora o transacciones se define un Puerto y se inyecta por constructor.
- **Regla 3:** todo fallo de negocio retorna `Result.err(new DomainError(...))`; nunca `throw`.
- **Regla 6:** todo caso de uso que cree, actualice, anule o cambie estado inyecta `IAuditor` y registra `{ antes, despues }`.
- Un caso de uso recibe sus dependencias por **constructor** (solo interfaces), expone un único `execute(input, contexto)` y retorna `Promise<Result<Output, DomainError>>`.

---

## 🛠️ Forma de Uso

```typescript
export class CrearProductoUseCase {
  constructor(
    private readonly repositorio: IProductoRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly auditor: IAuditor,
  ) {}

  async execute(input: CrearProductoInput, contexto: ContextoActor): Promise<Result<ProductoSnapshot, DomainError>> {
    const creado = Producto.crear(input);
    if (!creado.ok) return creado;
    // ... persistir vía puerto y auditar con this.auditor.registrar({ ... detalles: { antes, despues } })
  }
}
```
