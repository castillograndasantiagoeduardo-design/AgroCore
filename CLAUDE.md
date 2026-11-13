# 🤖 Contexto Global del Proyecto - AgroCore

> **Documento Maestro de Contexto para Asistentes de IA (Claude)**
> Punto de entrada para entender la arquitectura, reglas, flujo de trabajo y módulos de este monorepo con **Clean Architecture + Hexagonal + DDD táctico**.

---

## ⚠️ Instrucción Obligatoria

**Antes de modificar una capa, lee su `LAYER.md` y el `MODULE.md` del módulo que vas a tocar.** Si una petición contradice la matriz de dependencias o las 7 Reglas de Oro, detente y explícalo antes de escribir código.

---

## 🧭 1. Índice de Archivos de Contexto

| Archivo | Propósito | Cuándo consultarlo |
| :--- | :--- | :--- |
| **[`Docs/PROGRESO.md`](./Docs/PROGRESO.md)** | Estado actual, preferencias del usuario y siguientes pasos. | **Al iniciar cada sesión.** |
| **[`context/rules_architecture.md`](./context/rules_architecture.md)** | Filosofía, diagramas, matriz de dependencias y las 7 Reglas de Oro. | **SIEMPRE** antes de escribir código. |
| **[`context/ai_development_workflow.md`](./context/ai_development_workflow.md)** | Los 7 pasos para agregar funcionalidad, con checklist. | Al recibir "crea el módulo X", "agrega el endpoint Y", etc. |
| **`<capa>/LAYER.md`** | Propósito, importaciones permitidas/prohibidas, restricciones y ejemplo de la capa. | Antes de modificar cualquier archivo de esa capa. |
| **`Backend/packages/core/src/modules/<modulo>/MODULE.md`** | Entidades, casos de uso, errores y archivos del módulo en cada capa. | Antes de modificar un módulo. |

**LAYER.md por capa:**

| Capa | LAYER.md |
| :--- | :--- |
| `@agrocore/shared-kernel` | [`Backend/packages/shared-kernel/LAYER.md`](./Backend/packages/shared-kernel/LAYER.md) |
| `@agrocore/contracts` | [`Shared/contracts/LAYER.md`](./Shared/contracts/LAYER.md) |
| `@agrocore/core` | [`Backend/packages/core/LAYER.md`](./Backend/packages/core/LAYER.md) |
| `@agrocore/database` | [`Backend/packages/database/LAYER.md`](./Backend/packages/database/LAYER.md) |
| `@agrocore/platform` | [`Backend/packages/platform/LAYER.md`](./Backend/packages/platform/LAYER.md) |
| `@agrocore/composition` | [`Backend/packages/composition/LAYER.md`](./Backend/packages/composition/LAYER.md) |
| `@agrocore/api` | [`Backend/apps/api/LAYER.md`](./Backend/apps/api/LAYER.md) |
| `@agrocore/mcp-server` | [`Backend/apps/mcp-server/LAYER.md`](./Backend/apps/mcp-server/LAYER.md) |
| `Frontend` | [`Frontend/LAYER.md`](./Frontend/LAYER.md) |

---

## 🏛️ 2. Resumen Ejecutivo de la Arquitectura

- **Backend:** Workspace **Deno 2.x** con TypeScript.
- **HTTP:** **Hono** (`apps/api`). **IA:** Servidor **MCP** (`apps/mcp-server`).
- **Persistencia:** **Drizzle ORM + MySQL 8** (`mysql2/promise`).
- **Validación en frontera:** **Zod** (`Shared/contracts`).
- **Frontend:** **Next.js 16** (App Router + Features) + **Tailwind v4**.
- **Dependencias:** siempre apuntan hacia adentro (hacia `core` y `shared-kernel`).
- **Errores de negocio:** `Result<T, DomainError>`, nunca `throw`.
- **Ensamblaje:** solo en `createContainer` (`@agrocore/composition`).

---

## 🌳 3. Mapa de Directorios

```text
AgroCore/
├── CLAUDE.md / GEMINI.md       # 🌟 Orquestadores de contexto para IA
├── context/                    # 📜 rules_architecture.md, ai_development_workflow.md
├── Shared/
│   └── contracts/              # @agrocore/contracts (Esquemas Zod, catálogos de auditoría y tools MCP)
├── Backend/                    # Workspace Deno 2.x (deno.json)
│   ├── packages/
│   │   ├── shared-kernel/      # @agrocore/shared-kernel (Result<T,E>, DomainError, Pagination)
│   │   ├── core/               # @agrocore/core (Entidades, Value Objects, Casos de Uso, Puertos)
│   │   ├── database/           # @agrocore/database (Drizzle ORM, MySQL2, Repositorios, UnitOfWork)
│   │   ├── platform/           # @agrocore/platform (Proveedores externos NASA/ORNL/OSM, impresora ESC/POS)
│   │   └── composition/        # @agrocore/composition (Contenedor DI: createContainer)
│   └── apps/
│       ├── api/                # @agrocore/api (Servidor HTTP REST con Hono)
│       └── mcp-server/         # @agrocore/mcp-server (Servidor MCP para Agentes IA)
├── Frontend/                   # Next.js 16 (App Router + Features + Tailwind v4)
│   └── src/{app, features, components, lib}
├── Docs/                       # Documentación técnica (DDL SQL, ADRs, guías)
└── Http/                       # Pruebas funcionales ejecutables (.http)
```

---

## 📦 4. Módulos del Proyecto

Cada módulo vive en `Backend/packages/core/src/modules/<modulo>/` y tiene su `MODULE.md`:

- **`fincas`** — Entidad `Finca` · [MODULE.md](./Backend/packages/core/src/modules/fincas/MODULE.md)
- **`clima`** — Perfil climático por finca (NASA POWER, corrección por altitud) · [MODULE.md](./Backend/packages/core/src/modules/clima/MODULE.md)
- **`cultivos`** — Catálogo global de referencia de 51 cultivos (temperaturas ECOCROP, tolerancias, pH, textura, plagas; solo lectura) · [MODULE.md](./Backend/packages/core/src/modules/cultivos/MODULE.md)
- **`rotaciones`** — Motor que compara 3–4 estrategias de 2 años en temporadas reales de cualquier lugar (A actual, B suelo, C forraje/ingreso, D agua) con evidencia y fuente, calendario y oportunidades · [MODULE.md](./Backend/packages/core/src/modules/rotaciones/MODULE.md)
- **`terreno`** — Análisis del sitio (punto o área ≤ 100 ha): aptitud ("No se puede sembrar: es carretera"), SRTM, SoilGrids, NDVI MODIS (meses baldíos), cobertura MODIS · [MODULE.md](./Backend/packages/core/src/modules/terreno/MODULE.md)
<!-- @scaffold:modules -->

---

## ⚡ 5. Reglas de Oro (resumen — detalle en `context/rules_architecture.md`)

1. **Ley de Dependencia Estricta:** respeta la matriz de importaciones.
2. **Pureza de `core`:** nada de `drizzle-orm`, `mysql2`, `hono`, `jose`, `argon2`, `nodemailer` ni `Deno.env`.
3. **`Result<T, DomainError>`:** ninguna regla de negocio lanza `throw`.
4. **Sin instanciación manual** fuera de `composition`.
5. **Validación Zod obligatoria** en la frontera.
6. **Auditoría transversal** con `IAuditor` y `sanitizarDetalles`.
7. **Integridad de BD:** tablas append-only, correcciones por movimiento inverso.

---

## 🚀 6. Comandos Frecuentes

```bash
# Backend (desde Backend/)
deno task dev:api      # API REST Hono
deno task dev:mcp      # Servidor MCP (stdio)
deno task test         # Tests unitarios de core
deno task check        # Verificación de tipos

# Frontend (desde Frontend/)
npm install && npm run dev
```
