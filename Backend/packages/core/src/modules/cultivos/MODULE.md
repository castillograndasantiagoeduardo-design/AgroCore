# 📦 Módulo `cultivos`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.
> Se creó a mano (no con `add_module`): es un **catálogo de referencia de solo lectura**, no un CRUD.

---

## 🎯 Propósito

Catálogo de **11 cultivos de clima frío de Duitama** con las características que necesita el motor de
rotaciones: ciclo, rango de altitud (posible y óptimo), tolerancia a helada, necesidad de agua,
fijación de nitrógeno, cobertura del suelo, familia botánica y valor forrajero. Cada cultivo trae
notas y fuentes.

Cultivos: papa, arveja, haba, tarwi, cebada, trigo, avena + vicia, quinua, maíz de clima frío,
cebolla de bulbo y pradera raigrás + trébol.

> ⚠️ Los valores son **de referencia** (FAO ECOCROP ajustado al altiplano). Hay que validarlos con un
> agrónomo local (UMATA / AGROSAVIA) antes de usarlos para decisiones reales.

---

## 🧩 Dominio

| Elemento | Nombre | Descripción |
| :--- | :--- | :--- |
| Entidad | `Cultivo` | Identidad = `clave` (slug, ej. `avena_vicia`). Se crea con `Cultivo.crear()`, que valida las invariantes. |
| Value Object | `Rango` | `[min, max]` finito, ≥ 0 y `min ≤ max`. Métodos `contiene(v)` e `incluye(otroRango)`. |
| Método | `aptitudPorAltitud(m)` | `optima` (rango óptimo) · `posible` (rango general) · `no_apta`. |
| Método | `compartenFamilia(otro)` | Base de la regla de rotación "no repetir familia" (papa tras papa). |
| Función | `nivelAlMenos(nivel, minimo)` | Compara `baja < media < alta`. |
| Servicio | `filtrarCultivos(cultivos, criterios)` | Filtra por altitud, familia, uso, fijación de N y tolerancia mínima a helada; con altitud ordena primero los óptimos. Lo reutilizará `rotaciones`. |
| Puerto | `ICultivoRepository` | `listar()`, `buscarPorClave(clave)`. |

**Invariantes de `Cultivo`:** clave válida, nombre no vacío, ≥ 1 familia, ≥ 1 fuente, rangos válidos,
altitud óptima dentro de la posible y **solo las fabáceas fijan nitrógeno**.

## ⚠️ Errores de Dominio

| Código | Clase | HTTP |
| :--- | :--- | :--- |
| `CULTIVO_NO_ENCONTRADO` | `CultivoNoEncontradoError` | 404 |
| `CULTIVO_DATOS_INVALIDOS` | `CultivoDatosInvalidosError` | 422 (en la práctica impide arrancar: el catálogo se valida al construirse) |

## ⚙️ Casos de Uso

| Caso de uso | Clave en `AppContainer` | Puertos inyectados | Audita |
| :--- | :--- | :--- | :--- |
| `ListarCultivosUseCase` | `listarCultivos` | `ICultivoRepository` | ❌ (solo lectura) |
| `ObtenerCultivoUseCase` | `obtenerCultivo` | `ICultivoRepository` | ❌ (solo lectura) |

---

## 📁 Archivos por Capa

### 1. Contrato — Shared/contracts
- `Shared/contracts/src/cultivos.schema.ts` (enums `FAMILIAS_BOTANICAS`, `NIVELES`, `VALORES_FORRAJEROS`, `USOS_CULTIVO`, `APTITUDES_ALTITUD`; `ListarCultivosQuerySchema`, `ObtenerCultivoParamsSchema`, `CultivoSchema`)
- `mcp-tools.ts` → `CULTIVOS_LISTAR`, `CULTIVOS_OBTENER`

### 2. Dominio — core/domain
- `domain/entities/cultivo.entity.ts`
- `domain/value-objects/rango.vo.ts`
- `domain/errors/cultivo.errors.ts`
- `domain/services/filtrar-cultivos.service.ts`
- `domain/repositories/cultivo.repository.ts`

### 3. Aplicación — core/application
- `application/ports/index.ts`
- `application/use-cases/listar-cultivos.use-case.ts`
- `application/use-cases/obtener-cultivo.use-case.ts`
- `Backend/packages/core/tests/cultivos/cultivos.use-case.test.ts`

### 4. Infraestructura — database
- `Backend/packages/database/src/catalogos/catalogo-cultivos.datos.ts` (los 11 cultivos, solo datos)
- `Backend/packages/database/src/catalogos/catalogo-cultivos-en-memoria.ts` (`CatalogoCultivosEnMemoria`, Fail-Fast)
- `Backend/packages/database/tests/catalogo-cultivos.test.ts` (valida el catálogo real)
- Sin tabla MySQL por ahora (ver "Cómo extender").

### 5. Ensamblaje — composition
- `Backend/packages/composition/src/container.ts` → `listarCultivos`, `obtenerCultivo`

### 6. Entrada — apps/api y apps/mcp-server
- `Backend/apps/api/src/controllers/cultivos.controller.ts`
- `Backend/apps/api/src/routes/cultivos.routes.ts` → `GET /api/cultivos`, `GET /api/cultivos/:clave`
- `Backend/apps/mcp-server/src/tools/cultivos.tools.ts` → `cultivos_listar`, `cultivos_obtener`
- `Http/cultivos.http`
- `Backend/scripts/probar-cultivos.ts` (prueba sin MySQL: `deno run -A scripts/probar-cultivos.ts 3300`)

### 7. Interfaz — Frontend
- Pendiente: tarjetas de cultivos en la vista de la finca.

---

## 🛠️ Forma de Uso

```http
GET /api/cultivos?altitudM=2530&familia=fabaceas
```

Filtros (todos opcionales, se combinan con Y): `altitudM`, `familia`, `uso` (`alimento` | `forraje` |
`doble_proposito`), `fijaNitrogeno` (`true` | `false`), `toleranciaHeladaMin` (`baja` | `media` | `alta`).

---

## ➕ Cómo extender el módulo

- **Agregar o corregir un cultivo:** editar `catalogo-cultivos.datos.ts` y correr `deno task test`. Si el
  dato es incoherente, el test del catálogo falla con el cultivo y el campo exactos.
- **Pasarlo a MySQL (para que un agrónomo lo edite desde la app):** crear la tabla, un
  `MySqlCultivoRepository implements ICultivoRepository` y cambiar una línea en `createContainer`.
  Los casos de uso que lo editen sí deben inyectar `IAuditor` (Regla 6).

## 🚫 Restricciones

- `core` no conoce de dónde vienen los datos: solo `ICultivoRepository` (Regla 2).
- Los casos de uso no lanzan excepciones; solo `CatalogoCultivosEnMemoria` lanza al arrancar si el
  catálogo es inválido (fallo técnico de configuración, Regla 3).
