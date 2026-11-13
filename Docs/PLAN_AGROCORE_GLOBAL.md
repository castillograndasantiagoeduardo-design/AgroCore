# 🌍 Plan de acción — AgroCore global

> Documento de trabajo para Claude Code. Guárdalo en `Docs/PLAN_AGROCORE_GLOBAL.md`.
> Parte del estado descrito en `Docs/PROGRESO.md` (2026-11-12): monorepo Deno + Next.js,
> módulos `fincas`, `clima`, `cultivos`, `rotaciones`, `autenticacion`, todo atado a Duitama.

---

## 🎯 Objetivo

0. **Simplificar el backend:** quitar el login, JWT, usuarios y roles/permisos, sin romper la Clean Architecture.
1. Renombrar internamente el proyecto de **DuitamaCrece / duitamacrece** a **AgroCore / agrocore**.
2. Que en el mapa se pueda seleccionar **cualquier lugar del mundo** (punto o área) y, con datos de la
   NASA más fuentes abiertas complementarias, obtener:
   - información local del **suelo**, del **terreno** y del **clima**;
   - **cultivos aptos** y sus características;
   - las **prioridades del agricultor** (agua, suelo, plagas, forraje, ingreso);
   - un **calendario** que resalte:
     - los meses en que el campo suele estar **baldío**;
     - las **temporadas de vulnerabilidad** (helada, calor, déficit de agua, lluvia extrema);
     - las **oportunidades de rotación** (cortar ciclos de plagas, bajar la demanda de agua, mejorar la infiltración, sumar ingreso);
   - una **comparación de al menos 3 estrategias de rotación**, incluida la actual. Cada una con:
     - por qué se sugirió;
     - evidencia;
     - beneficios;
     - vacíos de información;
     - riesgos para revisión local.
3. **Detección de carreteras:** si el punto o el área cae sobre una vía, la app dice
   *"No se puede sembrar: es carretera"* y no calcula rotaciones para esa parte.
4. **Impresión térmica:** imprimir un ticket con el resumen del terreno seleccionado en una impresora
   térmica (ESC/POS, 58 u 80 mm).

> Principio que se mantiene: **sugiere y explica; no reemplaza el criterio del agricultor ni del agrónomo.**

---

## 🛰️ Fuentes de datos (todas globales)

| Necesidad | Fuente | Acceso | Notas |
| :--- | :--- | :--- | :--- |
| Clima diario 30 años (lluvia, Tmín/Tmáx, radiación) | **NASA POWER** (ya integrado) | REST, sin clave | Ya funciona en cualquier lat/lon. |
| Humedad del suelo (superficie y raíz) | **NASA POWER** `GWETTOP`, `GWETROOT`, `GWETPROF` | Mismo cliente | Inmediato. SMAP (AppEEARS) queda como mejora. |
| Evapotranspiración de referencia | Calculada (Hargreaves) con POWER `T2M_MAX`, `T2M_MIN`, `ALLSKY_SFC_SW_DWN`/`TOA_SW_DWN` | Dominio puro | Para el déficit hídrico y la demanda de agua. |
| NDVI 2000–hoy (campos baldíos, estrés de vegetación) | **MODIS MOD13Q1** (250 m, 16 días) vía **ORNL DAAC TESViS** `https://modis.ornl.gov/rst/api/v1/` | REST, sin clave | Consultar primero `/dates`; respetar el límite de fechas por petición; cachear. |
| Uso/cobertura del suelo (cultivo, urbano, agua, bosque) | **MODIS MCD12Q1** vía el mismo servicio ORNL | REST, sin clave | Marca zonas no agrícolas. |
| Elevación y pendiente | **SRTM** (NASA) vía **AppEEARS** (cuenta Earthdata ya creada) | REST con token, asíncrono | Mientras tanto: la elevación de la celda POWER o un valor que ingrese el usuario. |
| Propiedades del suelo (textura, pH, carbono orgánico, N) | **ISRIC SoilGrids v2.0** `rest.isric.org/soilgrids/v2.0/properties/query` | REST, beta | ⚠️ ISRIC tiene **pausada** la API. El adaptador debe tolerar la caída: devuelve `null` y lo registra como **vacío de información**. |
| Carreteras (y, de paso, edificaciones y cuerpos de agua) | **OpenStreetMap** vía **Overpass API** | REST, sin clave | `way["highway"](around:R,lat,lon)` para un punto; bbox + intersección para un área. User-Agent propio, caché y backoff. |
| Calibración local | **IDEAM** (ya integrado) | — | Solo aplica si hay una estación a ≤ 25 km (Colombia). En otros lugares, `calibracion: null` (ya está soportado). |
| Requisitos de cultivos | **FAO ECOCROP** + literatura | Datos versionados en código | Rangos de temperatura, lluvia, altitud, ciclo, tolerancia a la helada y al calor. |
| Opcionales (fase final) | GPM IMERG, ECOSTRESS, GRACE/GRACE-FO, SMAP | AppEEARS / Earthdata | Tendencia hídrica de largo plazo y estrés térmico/hídrico de alta resolución. |

---

## 🧱 Fases

Cada fase termina con `deno task check`, `deno task test`, `npx tsc --noEmit`, la actualización de
`MODULE.md` / `LAYER.md` / `Docs/PROGRESO.md` y un **alto para que el usuario confirme**.

### Fase 0 — Preparación (sin cambios funcionales)

- Crear la rama `feat/agrocore-global`.
- Correr check y tests para dejar la línea base (debe dar 76/76).
- Recordar al usuario el bloqueante pendiente: migraciones `001` y `002`.

### Fase 0.5 — Quitar login y roles (se mantiene la arquitectura)

**Objetivo:** la API y el MCP quedan abiertos, sin JWT ni RBAC, y se conservan las 7 capas, los puertos,
`Result`, Zod y la auditoría.

**Se elimina por completo:**
- **Módulo `autenticacion`:** `core/src/modules/autenticacion/` (entidad `Usuario`, `IniciarSesionUseCase`, errores y su test).
- **Contratos:** `Shared/contracts/src/auth.schema.ts`, `roles.ts`, `permissions.ts` y sus exportaciones en `index.ts`.
- **Platform:** `jwt-token-service.ts`, `pbkdf2-password-hasher.ts` y su test.
- **Database:**
  - `usuarios.schema.ts`;
  - `mysql-usuario.repository.ts`;
  - `usuario.mapper.ts`.
- **API:**
  - `middlewares/auth.ts`;
  - `auth.controller.ts`;
  - `auth.routes.ts`;
  - el uso de `requireAuth`/`requirePermission` en todas las rutas;
  - `actor` en `types.ts`.
- **MCP:** la comprobación `tienePermiso` y el campo `permission` de cada tool en `tool-gateway.ts` y `tools/*.ts`.
- **Composition:** `tokenService`, `passwordHasher`, `iniciarSesion` y `JWT_SECRET` en `config.ts`.
- **Scripts:** `crear-admin.ts`, `emitir-token.ts`, `Http/auth.http` y las cabeceras `Authorization` de los otros `.http`.
- **Frontend:**
  - la lectura del token en `lib/http-client.ts`;
  - `Frontend/.env.local` con el token (indicarle al usuario que lo borre);
  - el grupo `(autenticacion)`;
  - `(punto-de-venta)`, que quedó del scaffold y no se usa.
- **`.env.example`:** se quita `JWT_SECRET`.

**Se reemplaza:**
- `ContextoActor { usuarioId, rol, ip }` → `ContextoSolicitud { origen: "api" | "mcp" | "script", ip: string | null }` en `auditor.port.ts` y en todas las firmas `execute(...)`.
- **Auditoría (Regla 6 sigue vigente):** `logs_auditoria.usuario_id` y `mcp_tool_logs.usuario_id` pasan a una columna `origen VARCHAR(16)`. Migración `003b_quitar_usuarios.sql`:
  - agrega `origen`;
  - vuelve nullable o elimina `usuario_id`;
  - `DROP TABLE usuarios` **solo con confirmación del usuario**, porque los triggers append-only se mantienen.
- **Documentación:**
  - quitar las columnas "Permiso" de los `MODULE.md`;
  - quitar RBAC de `rules_architecture.md` y `LAYER.md`;
  - quitar el pendiente "Login y emisión de JWT" de `PROGRESO.md`;
  - actualizar `CLAUDE.md`.

**Protección mínima en lugar del login:**
- CORS restringido al origen del Frontend (`FRONTEND_ORIGIN` en `.env`);
- límite simple de peticiones por IP en memoria para los endpoints que llaman a proveedores externos;
- tamaño máximo del body.

Nota: sin login, cualquiera que alcance el puerto 8001 puede usar la API. Es aceptable en local y para la demo; antes de publicarla en internet hay que revisarlo.

**Verificación:**
- check y tests en verde (el total bajará al borrar los tests de auth);
- `grep -ri "jwt\|tienePermiso\|PERMISSIONS\|ROLES\|requireAuth"` sin resultados en el código;
- `/api/fincas`, `/api/clima` y `/api/rotaciones` responden sin cabecera `Authorization`.

### Fase 1 — Renombre a AgroCore

- **Scope de paquetes:** `@duitamacrece/*` → `@agrocore/*` en:
  - todos los `deno.json`, el `package.json` del Frontend y de `Shared/contracts`;
  - los imports y los `LAYER.md`.
- **Textos:**
  - `DuitamaCrece` → `AgroCore` en `CLAUDE.md`, `GEMINI.md`, `context/*`, `Docs/*`, el Frontend y los mensajes;
  - el nombre del servidor MCP.
- **Base de datos:**
  - `duitama_crece` → `agrocore` y `duitama_app` → `agrocore_app` en `ddl.sql`, `.env.example` y la documentación;
  - **no** tocar el `.env` real ni ejecutar SQL. Entregar al usuario los pasos en PowerShell/MySQL para crear la base nueva (o seguir usando la actual cambiando solo `.env`).
- **Lo que NO se renombra en esta fase:** las menciones geográficas a Duitama que son datos (estación IDEAM, ejemplos, tests). Esas cambian en la Fase 2.
- **Regenerar los lockfiles:** `npm install` en Frontend y en contracts.
- **Verificar que no quede rastro:** `grep -ri "duitamacrece\|duitama_crece"` debe quedar vacío.

### Fase 2 — Ubicación global

- **`UbicacionFinca`:**
  - eliminar `AREA_ESTUDIO_DUITAMA` y los límites de 2.300–4.000 m;
  - validar solo latitud −90..90, longitud −180..180 y altitud −500..6.000 m;
  - reemplazar `zona` (valle/ladera/alta) por una clasificación genérica derivada del clima (por ejemplo, tropical, subtropical, templado, frío, de altura), calculada en `clima` y no a mano.
- **Contratos Zod:** quitar las restricciones de Duitama. Agregar `AreaSeleccionadaSchema`: un punto, o un polígono GeoJSON de hasta 100 ha con límite de vértices.
- **Frontend `SelectorMapa`:**
  - mapa mundial, sin el rectángulo de Duitama, con zoom inicial según la ubicación;
  - dos modos: **punto** (clic) y **área** (dibujar un rectángulo o polígono; `leaflet-draw` o equivalente liviano);
  - buscador de lugares opcional con Nominatim (respetando su política de uso).
- **Migración `004_fincas_globales.sql`:** campo `area_geojson` (JSON NULL), `pais`, `region`; renombrar `vereda` → `localidad`.
- **Tests:**
  - actualizar los que asumían Duitama;
  - agregar casos en Kenia, España, Iowa, India y la Patagonia.

### Fase 3 — Módulo nuevo `terreno` (análisis del sitio, solo lectura)

Caso de uso `AnalizarTerrenoUseCase(area)`. Devuelve `PerfilTerreno` con:

- `aptitud`:
  - `apto`;
  - `no_apto_carretera` (mensaje: *"No se puede sembrar: es carretera"*);
  - `no_apto_edificacion`;
  - `no_apto_agua`;
  - `no_apto_uso_suelo` (urbano o bosque según MCD12Q1).

  Para un área se informa también el **% del área afectado** y se excluye esa parte.
- `elevacionM`, `pendientePct` (cuando haya SRTM).
- `suelo`: textura (arena/limo/arcilla), pH, carbono orgánico, nitrógeno y profundidad 0–30 cm, o `null` con su vacío de información.
- `humedadSuelo` mensual (POWER GWET*).
- `ndvi`:
  - serie de 16 días de los últimos 5–10 años;
  - climatología mensual;
  - **meses típicamente baldíos** (NDVI bajo un umbral relativo al máximo local, con la regla documentada);
  - **estrés de vegetación** (anomalía de NDVI).
- `coberturaMODIS`: clase IGBP.
- `fuentes[]` y `vaciosInformacion[]`.

**Puertos en `core`** (implementados en `platform`):
- `IViasProvider` (Overpass);
- `ICoberturaProvider` y `INdviProvider` (ORNL);
- `ISueloProvider` (SoilGrids);
- `IElevacionProvider` (AppEEARS/SRTM).

**Robustez de los proveedores:**
- cada uno con timeout, reintento con backoff y caché en memoria;
- caché persistente en MySQL en tabla `cache_proveedores` (clave = proveedor + lat/lon redondeadas + parámetros), si el usuario lo aprueba;
- si un proveedor falla, el perfil sale igual, con advertencia: **nunca 500 por un proveedor externo**.

**Reglas del dominio:**
- la decisión "es carretera" vive en el dominio como regla pura: el adaptador solo entrega las geometrías;
- se considera carretera si el punto está a menos de la mitad del ancho típico de la vía según `highway=*` (por ejemplo, motorway/trunk 12 m, primary 8 m, secondary 6 m, tertiary/residential 4 m, track 2 m; valores documentados y ajustables).

**Entradas:**
- `POST /api/terreno/analizar`;
- tool MCP `terreno_analizar`;
- archivo `Http/terreno.http`;
- script `scripts/probar-terreno.ts <lat> <lon>` (sin MySQL).

### Fase 4 — Clima global y calendario de vulnerabilidad

- **Ventanas de siembra:** reemplazar marzo/septiembre por **temporadas de cultivo derivadas** del perfil climático:
  - meses con temperatura media ≥ mínimo térmico;
  - sin riesgo alto de helada;
  - con lluvia o riego suficientes.
- Esto debe soportar:
  - régimen unimodal y bimodal;
  - el hemisferio sur;
  - climas con invierno (una temporada más el invierno, que se aprovecha con cobertura o barbecho).
- **Indicadores mensuales nuevos:**
  - estrés por calor (días con Tmáx ≥ umbral);
  - ET0 y balance hídrico (lluvia − ET0);
  - lluvia extrema (ya existe);
  - helada (ya existe).
- **`calendarioVulnerabilidad`:** por mes, qué amenaza hay y cómo de fuerte, y qué cultivos del plan actual quedan expuestos.
- **IDEAM:** queda como calibración opcional (solo Colombia); los tests de calibración se mantienen.

### Fase 5 — Catálogo global de cultivos

- Pasar de 11 a ~40–60 cultivos que cubran climas fríos, templados, tropicales y áridos. Incluir:
  - cereales, leguminosas, tubérculos, hortalizas, forrajes;
  - coberturas y abonos verdes.
- **Campos nuevos:**
  - rango de temperatura óptimo y absoluto;
  - lluvia anual óptima;
  - tolerancia al calor;
  - tolerancia a la sequía;
  - pH óptimo;
  - texturas preferidas;
  - profundidad de raíz (relacionada con la infiltración);
  - si es anual o perenne;
  - ciclo en días;
  - si **ocupa más de una temporada**;
  - plagas/enfermedades clave por familia.
- **Fuente:** FAO ECOCROP y literatura. Cada valor debe llevar su fuente en el código (usar el subagente `investigador-cultivos`).
- **`filtrarCultivos`:** que filtre también por clima del sitio y suelo (pH, textura) cuando se conozcan.

### Fase 6 — Motor de rotaciones generalizado

- **Horizonte:** 2 años expresados en **temporadas reales del sitio**, no en semestres fijos. Debe:
  - soportar cultivos que ocupen dos temporadas (maíz, tarwi);
  - soportar barbecho o cobertura en invierno.
- **Estrategias** (mínimo 3, siempre distintas):
  - **A (actual)**: lo que siembra hoy, sin corregir;
  - **B (suelo)**: fijación de N, cobertura, infiltración, ruptura de plagas;
  - **C (forraje/ingreso)**: biomasa o ingreso;
  - **D (agua)** opcional cuando la prioridad de agua sea ≥ 4 o haya déficit hídrico.
- **Reglas nuevas:**
  - `no_sembrar_en_carretera` (bloqueante; viene de `terreno`);
  - `cobertura_en_pendiente` (pendiente > 25 % ⇒ cobertura permanente o curvas de nivel);
  - `aprovechar_baldio` (si el NDVI muestra meses baldíos, proponer cobertura o abono verde ahí);
  - `suelo_compatible` (pH y textura);
  - `tolerancia_calor`.
- **Explicación de cada estrategia:** `porQue`, `evidencia` (con la fuente del dato: POWER, MODIS, SoilGrids, ECOCROP o regla), `beneficios`, `vaciosInformacion`, `riesgos`. **Solo con datos calculados**; no inventar cifras.
- **Oportunidades destacadas:**
  - "en los meses X–Y el lote suele estar baldío → cobertura Z";
  - "la temporada X es la más vulnerable por calor/helada/sequía";
  - "romper el ciclo de solanáceas con…";
  - "menor demanda de agua con…".
- **Endpoint para cualquier lugar sin guardar finca:** `POST /api/rotaciones/comparar` con `{ area, cultivoActual, secuenciaActual?, tieneRiego, prioridades }`. El de finca guardada se mantiene.

### Fase 7 — Frontend

- **Página principal** `/explorar`:
  - mapa mundial y selección de punto o área;
  - formulario corto: cultivo actual, ¿tiene riego?, prioridades con presets.
- **Panel de resultados:**
  - **aptitud** (banner rojo *"No se puede sembrar: es carretera"* cuando aplique, con la vía resaltada en el mapa);
  - ficha de suelo y terreno;
  - **calendario de 12 meses** con las franjas baldío / vulnerable / oportunidad;
  - tabla comparativa de estrategias y tarjetas por estrategia;
  - fuentes y vacíos de información.
- **Estados:**
  - carga progresiva (la primera consulta de clima tarda ~45 s; mostrar qué fuente se está consultando);
  - manejo de proveedores caídos.
- **Navegación:**
  - el enlace a `/rotaciones` que faltaba en el layout;
  - opción "Guardar como finca".

### Fase 8 — Impresión térmica (Xprinter de 58 mm)

**Equipo del usuario:** Xprinter de escritorio de 58 mm (botón FEED, LEDs POWER/STATUS). Se asume conexión
**USB** y driver de Windows instalado; confirmar el modelo exacto (XP-58…) en la etiqueta inferior.

**Datos de impresión:**
- 58 mm de papel = 48 mm útiles;
- **32 caracteres por línea** en fuente A (42 en fuente B);
- comandos **ESC/POS**.

**Antes de programar:**
- apagarla, mantener **FEED** presionado y encenderla para imprimir la **autoprueba**;
- esa hoja dice la interfaz, el firmware y la **tabla de páginas de código**;
- con ella se confirma el valor `ESC t n` para tildes y ñ (normalmente PC850 o PC858).

**Vía principal: impresión silenciosa desde el backend**, porque el backend corre en el mismo Windows que la impresora.
- **Paso manual del usuario:** compartir la impresora en Windows (Propiedades de impresora → Compartir → nombre `XP58`).
- **Puerto en `core`:** `IImpresoraTermica.imprimir(ticket: TicketLineas): Promise<Result<void, DomainError>>`.
- **Módulo `impresion` en `core`, servicio de dominio puro `componerTicketTerreno(perfil, comparacion, ancho)`:**
  - devuelve líneas ya cortadas a 32 caracteres, con estilos marcados (título, negrita, separador);
  - sin bytes, sin `Date` (la fecha entra por `IReloj`).
- **Adaptador en `platform`, `EscPosWindowsPrinter`:**
  - convierte las líneas a bytes ESC/POS:
    - `ESC @` para inicializar;
    - `ESC t n` para la página de códigos;
    - `ESC E` para negrita;
    - `GS !` para el tamaño;
    - avance de líneas;
    - `GS V` para cortar, si la impresora tiene cortador;
  - codifica el texto en CP850/858;
  - escribe un archivo temporal y lo envía en crudo con `cmd /c copy /b <archivo> \\localhost\XP58` mediante `Deno.Command`;
  - nombre de la impresora y página de códigos configurables en `.env` (`IMPRESORA_COMPARTIDA=XP58`, `IMPRESORA_CODEPAGE=2`);
  - si falla: `Result.err(ImpresoraNoDisponibleError)`, nunca `throw`.
- **Endpoint** `POST /api/impresion/terreno`:
  - recibe la misma entrada del análisis (`area`, `cultivoActual`, `prioridades`…);
  - el backend recalcula con la caché (una sola fuente de verdad) e imprime.
- **Tool MCP** `impresion_terreno`, opcional.
- **Script** `scripts/probar-impresora.ts`: imprime una línea de prueba con "áéíóú ñ Ñ" para validar la página de códigos.

**Vía de respaldo (si el backend no está en el mismo equipo):**
- `window.print()` desde el Frontend con una vista `TicketImprimible`;
- CSS `@page { size: 58mm auto; margin: 0 }` y ancho de 48 mm;
- seleccionar la "XP-58" en el diálogo.

Web Serial/WebUSB no se usan: en Windows la Xprinter USB aparece como impresora (puerto USB001), no como puerto COM, y WebUSB exige cambiar el driver con Zadig, lo que rompe la impresión normal.

- **Ticket** `TicketTerreno`:
  - nombre/coordenadas, fecha, aptitud;
  - suelo resumido, meses baldíos y vulnerables;
  - las 3 estrategias en una línea cada una con su puntaje;
  - fuentes y el aviso *"Herramienta de apoyo. Validar con agrónomo local."*;
  - un QR opcional con el enlace al análisis.
- **Frontend:**
  - botón "🖨️ Imprimir ticket" en el panel de resultados (llama al endpoint);
  - si responde `IMPRESORA_NO_DISPONIBLE`, ofrecer el respaldo `window.print()`.
- **Arquitectura:**
  - la composición del ticket es dominio puro en `core/modules/impresion`;
  - los bytes ESC/POS y el envío a Windows viven solo en `platform`.

### Fase 9 — Verificación final

- Subagente `verificador`:
  - check, tests y tsc;
  - recorrido real con `npm run dev` en 5 lugares (Duitama, Iowa, Kenia, Andalucía, una autopista conocida para probar "es carretera");
  - impresión de prueba;
  - revisión de la matriz de dependencias.
- Actualizar `README.md`, `CLAUDE.md`, `Docs/PROGRESO.md` y los `MODULE.md` nuevos.

---

## ❓ Decisiones abiertas (para el usuario)

1. **Impresora:** confirmar el modelo exacto (etiqueta inferior), si es solo USB y si tiene cortador. Ancho ya definido: 58 mm.
2. **Base de datos:** ¿crear una base nueva `agrocore` o seguir con `duitama_crece` cambiando solo el `.env`? ¿Borrar la tabla `usuarios`?
3. **Área máxima** que se permite seleccionar (propuesta: 100 ha).
4. ¿Se mantiene la caché persistente en MySQL para los proveedores externos?

✅ Decidido: sin login ni roles (Fase 0.5).

---

## 🤖 Modo autónomo (`/goal`) — reglas de ejecución

Este plan se ejecuta **de principio a fin sin pausas entre fases**. Las "paradas para confirmar" de cada
fase se reemplazan por **verificación automática**: al cerrar cada fase se corren check, tests y tsc, se
hace commit local y se sigue. Solo hay que detenerse por lo que exige la sección "Pasos humanos".

### Decisiones tomadas (no preguntar)

- **Nombre:** `agrocore` (scope `@agrocore/*`, título "AgroCore").
- **Base de datos:**
  - el nombre sale de `.env`; el `ddl.sql` nuevo crea `agrocore`;
  - las migraciones se aplican a la base que diga `.env`;
  - la tabla `usuarios` **no se borra**: queda en desuso y su `DROP` se deja comentado en la migración.
- **Área máxima:** 100 ha. Caché persistente en MySQL: sí (tabla `cache_proveedores`).
- **Impresora:** Xprinter 58 mm compartida en Windows como `XP58`, 32 caracteres por línea, `IMPRESORA_CODEPAGE=2` (PC850) por defecto.
- **Sin login ni roles** (Fase 0.5).

### Reglas

- **Secretos:**
  - no imprimir, pedir ni editar los valores de `.env`;
  - se permite **leerlos solo a través de scripts** (`deno run --env-file=../.env ...`) para conectarse a MySQL y aplicar migraciones;
  - las variables nuevas se agregan a `.env.example` y se le dicen al usuario en el reporte final.
- **Migraciones:**
  - crear `scripts/aplicar-migraciones.ts`: aplica en orden los archivos de `Docs/migraciones/` no aplicados y registra cada uno en la tabla `migraciones_aplicadas`;
  - es idempotente y no destructivo (nada de `DROP` sin comentar).
- **Commits:**
  - trabajar en la rama `feat/agrocore-global`;
  - un commit local por fase (`fase N: ...`);
  - **nunca `push`**.
- **Conexión a internet:**
  - si un proveedor externo no responde, no se bloquea el avance: se verifica la degradación elegante (análisis con advertencia) y se reintenta al final;
  - AppEEARS es asíncrono: si el token `EARTHDATA_TOKEN` no está en `.env`, la elevación sale como vacío de información y se reporta.
- **Evidencia:** no declarar nada como hecho sin haber ejecutado el comando que lo demuestra en esta sesión.
- **Reporte final:** escribir `Docs/VERIFICACION_FINAL.md` y además **pegar en la conversación** la tabla de verificación con la salida resumida de cada comando, porque el evaluador de `/goal` solo ve la conversación.

### Pruebas de extremo a extremo (obligatorias)

**`scripts/smoke-e2e.ts`** (Deno): con la API corriendo, llama a los endpoints reales para:

| Lugar | Lat, Lon | Esperado |
| :--- | :--- | :--- |
| Duitama, Colombia | 5.8269, -73.0297 | `apto`, IDEAM calibrado, 3+ estrategias |
| Ames, Iowa, EE. UU. | 42.0080, -93.7000 (campo) | `apto`, temporada única + invierno |
| Nakuru, Kenia | -0.3031, 36.0800 (campo) | `apto`, régimen bimodal |
| Córdoba, Andalucía, España | 37.8500, -4.8500 (campo) | `apto`, verano seco con déficit hídrico |
| Autopista (punto sobre la calzada, verificado con Overpass) | se obtiene del propio Overpass | `no_apto_carretera`, mensaje "No se puede sembrar: es carretera", sin rotaciones |

Para cada lugar valida con Zod la respuesta de `POST /api/terreno/analizar` y `POST /api/rotaciones/comparar`:
- meses baldíos, calendario de vulnerabilidad y oportunidades presentes;
- 3 o más estrategias distintas, incluida la actual;
- cada estrategia con `porQue`, `evidencia`, `beneficios`, `vaciosInformacion` y `riesgos` no vacíos.

Termina con código 0 solo si todo pasa.

**Además:**
- `npm run build` del Frontend sin errores;
- con `npm run dev`, `GET /explorar` responde 200;
- se prueba la impresión: `scripts/probar-impresora.ts` y `POST /api/impresion/terreno` para Duitama deben terminar en `ok` (`copy /b` con código 0). Si la impresora no está compartida o encendida, el resultado esperado es `IMPRESORA_NO_DISPONIBLE` sin caída de la API, y se reporta como **paso humano pendiente**.

### Pasos humanos (lo único que Claude Code no puede hacer)

1. Antes de empezar:
   - MySQL80 encendido;
   - `.env` con las credenciales de MySQL;
   - opcional: `EARTHDATA_TOKEN`;
   - la impresora compartida como `XP58`, encendida y con papel.
2. Al final: confirmar con los ojos que el ticket salió con las tildes y la ñ bien. Si no, cambiar `IMPRESORA_CODEPAGE` según la hoja de autoprueba (FEED + encender).
