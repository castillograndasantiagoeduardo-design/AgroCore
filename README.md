# 🌍 AgroCore

**Planificación de rotación de cultivos para cualquier lugar del mundo**, con datos de la NASA y fuentes abiertas.
Selecciona un punto o un área (hasta 100 ha) en el mapa y obtén:

- **Aptitud del sitio**: si cae sobre una vía, la app dice **"No se puede sembrar: es carretera"** (también edificación,
  agua o uso del suelo), y excluye la parte afectada de un área.
- **Terreno**: elevación y pendiente (NASA SRTM), suelo (ISRIC SoilGrids), humedad del suelo (NASA POWER), NDVI de
  MODIS con **meses típicamente baldíos** y estrés de vegetación, y cobertura MODIS.
- **Clima de 30 años** (NASA POWER; calibrado con IDEAM en Colombia): temporadas de cultivo **derivadas del clima**
  (unimodal, bimodal, hemisferio sur, invierno, verano seco), ET0 y balance hídrico, y **calendario de vulnerabilidad**
  (helada, calor, déficit de agua, lluvia extrema).
- **Catálogo global de 51 cultivos** (rangos estilo FAO ECOCROP, tolerancias, pH, textura, plagas clave, confianza).
- **Comparación de 3–4 estrategias de rotación de 2 años** en las temporadas reales del sitio: A (actual), B (suelo),
  C (forraje / ingreso) y D (agua). Cada una con **por qué, evidencia con su fuente, beneficios, vacíos de información
  y riesgos**, más un **calendario de 12 meses** (baldío / vulnerable / oportunidad) y **oportunidades** de rotación.
- **Ticket térmico** (ESC/POS, 58 mm) con el resumen del terreno.

> **Sugiere y explica; no reemplaza el criterio del agricultor ni del agrónomo.**

---

## 🏛️ Arquitectura

Monorepo con **Clean Architecture + Hexagonal + DDD táctico** (ver `CLAUDE.md` y `context/rules_architecture.md`).

```text
AgroCore/
├── Shared/contracts/        # @agrocore/contracts — esquemas Zod (frontera compartida)
├── Backend/                 # Workspace Deno 2.x
│   ├── packages/
│   │   ├── shared-kernel/   # Result<T,E>, DomainError
│   │   ├── core/            # dominio + casos de uso + puertos (clima, cultivos, terreno, rotaciones, recomendacion, impresion)
│   │   ├── database/        # Drizzle + MySQL 8 (auditoría, caché de proveedores, precálculo regional, catálogo en código)
│   │   ├── platform/        # NASA POWER, IDEAM, Overpass/OSM, ORNL MODIS, SoilGrids, OpenTopoData/SRTM, ESC/POS
│   │   └── composition/     # createContainer (único lugar de ensamblaje)
│   ├── apps/api/            # REST con Hono (API abierta, sin login)
│   ├── apps/mcp-server/     # Servidor MCP para agentes de IA
│   └── scripts/             # migraciones, smoke E2E y pruebas manuales sin MySQL
├── Frontend/                # Next.js 16 + Tailwind v4 + Leaflet (/explorar, /rotaciones)
├── Docs/                    # ddl.sql, migraciones, PROGRESO.md, VERIFICACION_FINAL.md, plan
└── Http/                    # pruebas .http por módulo
```

**Fuentes de datos:** NASA POWER (clima diario 30 años y humedad del suelo), NASA MODIS MOD13Q1 / MCD12Q1 vía ORNL DAAC,
NASA SRTM 30 m vía OpenTopoData, ISRIC SoilGrids v2.0, OpenStreetMap (Overpass), normales IDEAM 1991-2020 (Colombia),
FAO ECOCROP y literatura para el catálogo. Todos los proveedores tienen timeout, reintento y caché (memoria + MySQL);
**un proveedor caído nunca produce un 500**: el análisis sale con advertencia y vacío de información.

---

## 🚀 Puesta en marcha (Windows / PowerShell)

### 1. Requisitos
- Deno 2.x, Node.js 22+, MySQL 8 encendido.
- Copia `.env.example` a `.env` y completa las credenciales de MySQL (nunca las subas al repositorio).

### 2. Base de datos
```powershell
cd Backend
deno run -A --env-file=../.env scripts/aplicar-migraciones.ts   # idempotente: crea la base de DB_NAME y aplica Docs/migraciones
```

### 3. API y Frontend
```powershell
cd Backend\apps\api;  deno task start          # http://localhost:8001
cd Frontend;          npm install; npm run dev # http://localhost:3000/explorar
```

### 4. Verificación
```powershell
cd Backend
deno task check                                                # tipos
deno task test                                                 # tests (core, database, platform)
deno run -A --env-file=../.env scripts/smoke-e2e.ts            # con la API encendida: 5 lugares de extremo a extremo
deno run -A --env-file=../.env scripts/probar-impresora.ts     # ticket de prueba "áéíóú ñ Ñ"
cd ..\Frontend; npx tsc --noEmit; npm run build
```

Pruebas manuales sin MySQL (desde `Backend/`):
`deno run -A scripts/probar-terreno.ts <lat> <lon>` · `deno run -A scripts/probar-rotaciones.ts <lat> <lon> <cultivo>` ·
`deno run -A scripts/probar-cultivos.ts <tempMediaC>` · `deno run -A scripts/probar-clima.ts`.

---

## 🔌 Endpoints principales

| Método | Ruta | Qué hace |
| :--- | :--- | :--- |
| POST | `/api/terreno/analizar` | `{ area }` → aptitud, relieve, suelo, NDVI, cobertura, fuentes y vacíos |
| POST | `/api/rotaciones/comparar` | `{ area, cultivoActual?, tieneRiego, prioridades, secuenciaActual?, altitudM? }` → estrategias, calendario, oportunidades |
| POST | `/api/impresion/terreno` | Ticket térmico (o vista previa con `soloVistaPrevia: true`) |
| GET | `/api/cultivos[?tempMediaC=&lluviaAnualMm=&ph=&textura=…]` | Catálogo global filtrado por clima y suelo |
| POST | `/api/clima/perfil` | `{ latitud, longitud, altitudM? }` → perfil climático de cualquier ubicación |

Herramientas MCP: `terreno_analizar`, `rotaciones_comparar_ubicacion`, `impresion_terreno`,
`cultivos_listar`, `cultivos_obtener`, `clima_perfil_ubicacion`, `recomendacion_por_epoca`.

El flujo es por **área seleccionada** en el mapa (punto o polígono ≤ 100 ha): no se guardan fincas.

---

## 🖨️ Impresora térmica (Xprinter XP-58)

1. Comparte la impresora en Windows: *Dispositivos e impresoras → XP-58 → Propiedades de impresora → Compartir* con el nombre **`XP58`**.
2. Imprime la autoprueba (apagar, mantener **FEED**, encender) y confirma la página de códigos; ajusta `IMPRESORA_CODEPAGE` si las tildes salen mal.
3. `deno run -A --env-file=../.env scripts/probar-impresora.ts` debe terminar en `ok`.

Si la impresora no está disponible, la API responde `IMPRESORA_NO_DISPONIBLE` (503) y el Frontend ofrece imprimir desde el navegador.

---

## ⚠️ Avisos

- **API abierta (sin login):** CORS restringido al Frontend, límite de peticiones por IP y tamaño máximo del body. Adecuado
  para uso local y demo; revisar la exposición antes de publicarla en internet.
- Los valores del catálogo, los pesos de los puntajes y la referencia de ingreso son **de referencia**: validar con un agrónomo local.
- Estado del proyecto, decisiones y pasos pendientes: `Docs/PROGRESO.md` y `Docs/VERIFICACION_FINAL.md`.
