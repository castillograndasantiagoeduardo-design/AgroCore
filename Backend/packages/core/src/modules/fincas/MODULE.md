# 📦 Módulo `fincas`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.

---

## 🎯 Propósito

Gestiona el ciclo de vida de la entidad **`Finca`** (creación con nombre único y listado paginado), respetando la arquitectura limpia de extremo a extremo.

---

## 🧩 Dominio

| Elemento | Nombre | Descripción |
| :--- | :--- | :--- |
| Entidad | `Finca` | `id`, `nombre`, `descripcion`, `ubicacion`, `vereda`, `tieneRiego`, `cultivoActual` (**clave del catálogo de cultivos**, ej. `papa`; `CrearFincaUseCase` verifica que exista), `activo`, `creadoEn`. Se crea con `Finca.crear()` y se reconstruye con `Finca.reconstruir()`. |
| Value Object | `NombreFinca` | Nombre recortado de 2 a 120 caracteres. |
| Value Object | `UbicacionFinca` | `latitud`, `longitud`, `altitudM` (opcional). Debe estar dentro de `AREA_ESTUDIO_DUITAMA` y entre 2.300 y 4.000 m. Deriva `zona`: `valle` (<2.600 m), `ladera` (2.600–2.999 m), `alta` (≥3.000 m). |
| Servicio de dominio | `verificarNombreFincaDisponible` | Falla si ya existe un `finca` con el mismo nombre. |
| Puerto | `IFincaRepository` | `buscarPorId`, `buscarPorNombre`, `listar`, `guardar`. |

## ⚠️ Errores de Dominio

| Código | Clase | HTTP |
| :--- | :--- | :--- |
| `FINCA_NO_ENCONTRADO` | `FincaNoEncontradoError` | 404 |
| `FINCA_DUPLICADO` | `FincaDuplicadoError` | 409 |
| `FINCA_NOMBRE_INVALIDO` | `FincaNombreInvalidoError` | 422 |
| `FINCA_FUERA_DE_AREA` | `FincaFueraDeAreaError` | 422 |
| `FINCA_ALTITUD_INVALIDA` | `FincaAltitudInvalidaError` | 422 |
| `FINCA_CULTIVO_DESCONOCIDO` | `FincaCultivoDesconocidoError` | 422 |
| `FINCA_YA_INACTIVO` | `FincaYaInactivoError` | 422 |

## ⚙️ Casos de Uso

| Caso de uso | Clave en `AppContainer` | Puertos inyectados | Permiso | Audita |
| :--- | :--- | :--- | :--- | :--- |
| `CrearFincaUseCase` | `crearFinca` | `IFincaRepository`, `IUnitOfWork`, `IAuditor`, `ICultivoRepository` (módulo cultivos) | `PERMISSIONS.FINCAS_CREAR` | ✅ `AUDIT_ACTIONS.FINCA_CREADO` |
| `ListarFincasUseCase` | `listarFincas` | `IFincaRepository` | `PERMISSIONS.FINCAS_LEER` | ❌ (solo lectura) |

---

## 📁 Archivos por Capa

### 1. Contrato — Shared/contracts
- `Shared/contracts/src/fincas.schema.ts`

### 2. Dominio — core/domain
- `Backend/packages/core/src/modules/fincas/domain/entities/finca.entity.ts`
- `Backend/packages/core/src/modules/fincas/domain/value-objects/nombre-finca.vo.ts`
- `Backend/packages/core/src/modules/fincas/domain/value-objects/ubicacion-finca.vo.ts`
- `Backend/packages/core/src/modules/fincas/domain/errors/finca.errors.ts`
- `Backend/packages/core/src/modules/fincas/domain/services/finca.service.ts`
- `Backend/packages/core/src/modules/fincas/domain/repositories/finca.repository.ts`

### 3. Aplicación — core/application
- `Backend/packages/core/src/modules/fincas/application/ports/index.ts`
- `Backend/packages/core/src/modules/fincas/application/use-cases/crear-finca.use-case.ts`
- `Backend/packages/core/src/modules/fincas/application/use-cases/listar-fincas.use-case.ts`
- `Backend/packages/core/src/modules/fincas/index.ts`
- `Backend/packages/core/tests/fincas/crear-finca.use-case.test.ts`

### 4. Infraestructura — database
- `Backend/packages/database/src/schema/fincas.schema.ts`
- `Backend/packages/database/src/mappers/finca.mapper.ts`
- `Backend/packages/database/src/repositories/mysql-finca.repository.ts`
- `Docs/migraciones/001_fincas_ubicacion.sql` y `Docs/migraciones/002_fincas_cultivo_actual_clave.sql`

### 5. Ensamblaje — composition
- `Backend/packages/composition/src/container.ts (registro)`

### 6. Entrada — apps/api y apps/mcp-server
- `Backend/apps/api/src/controllers/fincas.controller.ts`
- `Backend/apps/api/src/routes/fincas.routes.ts`
- `Backend/apps/mcp-server/src/tools/fincas.tools.ts`
- `Http/fincas.http`

### 7. Interfaz — Frontend
- `Frontend/src/features/fincas/types/fincas.types.ts`
- `Frontend/src/features/fincas/api/fincas.api.ts`
- `Frontend/src/features/fincas/hooks/use-fincas.ts`
- `Frontend/src/features/fincas/components/FincasVista.tsx`
- `Frontend/src/app/(panel)/fincas/page.tsx`

---

## 🚫 Restricciones

- El dominio de `fincas` no importa `drizzle-orm`, `mysql2`, `hono`, `jose` ni `Deno.env` (Regla 2).
- Ningún fallo de negocio usa `throw`: retorna `Result.err(new Finca...Error())` (Regla 3).
- `MySqlFincaRepository` y los casos de uso solo se instancian en `createContainer` (Regla 4).
- Toda entrada pasa por `CrearFincaSchema` / `ListarFincasQuerySchema` (Regla 5).
- Todo caso de uso nuevo que mute `fincas` inyecta `IAuditor` y registra `{ antes, despues }` (Regla 6).
- Nuevos códigos de error deben seguir los sufijos que entiende `presentResult` (`_NO_ENCONTRADO`, `_DUPLICADO`, `_YA_EXISTE`).

---

## 🛠️ Forma de Uso

**HTTP (`Http/fincas.http`):**
```http
POST /api/fincas
Authorization: Bearer <token>
Content-Type: application/json

{ "nombre": "La Esperanza", "latitud": 5.8269, "longitud": -73.0297, "altitudM": 2530, "tieneRiego": true, "cultivoActual": "papa" }
```

**MCP:** herramientas `fincas_listar` y `fincas_crear`.

**Desde un adaptador primario:**
```typescript
const result = await container.crearFinca.execute({ nombre: "La Esperanza", latitud: 5.8269, longitud: -73.0297 }, actor);
if (!result.ok) console.log(result.error.code); // FINCA_DUPLICADO, ...
```

**Frontend:**
```typescript
import { useFincas } from "@/features/fincas/hooks/use-fincas";
const { pagina, crear } = useFincas();
```

---

## ➕ Cómo extender el módulo

Sigue los 7 pasos de `context/ai_development_workflow.md` (contrato → dominio → caso de uso + test → infraestructura → composition → api/mcp → frontend) y actualiza este archivo.

<!-- Paquete: @duitamacrece/core -->
