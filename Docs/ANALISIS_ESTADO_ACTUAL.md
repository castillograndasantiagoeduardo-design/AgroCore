# Análisis del estado actual (antes de la versión 2)

> Fase 0 de la v2. Rama `feat/agrocore-v2`, creada desde `feat/agrocore-global` (commit `b589fae` + `252118a`, que
> guarda los cambios de rendimiento y diseño del usuario que estaban sin commitear). No se cambió código en esta fase.

## 1. Línea base ejecutada (2026-11-13)

| Comando | Resultado |
| :-- | :-- |
| `deno task check` (Backend) | exit 0 |
| `deno task test` (Backend) | **121 pasados, 0 fallidos** |
| `npx tsc --noEmit` (Frontend) | exit 0 |
| `GET http://localhost:3000/explorar` (dev en marcha) | 200 |
| `scripts/smoke-e2e.ts` contra la API en :8001 | **4/5 PASS en 317 s**: Duitama 12 s, Iowa 12 s, Nakuru **71 s**, Córdoba **70 s**; autopista FAIL ("Apto para sembrar": Overpass no respondió) |

## 2. Qué hace cada módulo y qué fuentes usa

| Módulo (core) | Qué hace | Fuentes externas | Adaptador (platform/database) |
| :-- | :-- | :-- | :-- |
| `fincas` | Crea y lista fincas guardadas (punto o polígono ≤ 100 ha). | Ninguna (MySQL `fincas`). | `MySqlFincaRepository` |
| `clima` | Perfil de 30 años: calendario mensual (lluvia, T mín/med/máx, días de helada y calor, ET0 Hargreaves, balance), resumen, temporadas derivadas, vulnerabilidad; calibración IDEAM ≤ 25 km; corrección por altitud. | NASA POWER diario (`T2M`, `T2M_MIN`, `T2M_MAX`, `PRECTOTCORR`), IDEAM normales 1991-2020 (datos.gov.co `nsz2-kzcq`, **solo Boyacá**). | `NasaPowerClient`, `IdeamNormalesClient` |
| `cultivos` | Catálogo de 51 cultivos en memoria (solo lectura) y filtro por clima. | Ninguna en vivo: valores escritos a mano por un subagente **sin verificar en línea**. | `CatalogoCultivosEnMemoria` |
| `terreno` | Aptitud (carretera, edificación, agua, uso del suelo), NDVI y meses baldíos, suelo, elevación y pendiente, humedad del suelo. | OSM Overpass, ORNL MODIS MCD12Q1 y MOD13Q1, ISRIC SoilGrids, OpenTopoData (SRTM 30 m), NASA POWER `GWET*`. | `OverpassViasClient`, `OrnlModisClient`, `SoilGridsClient`, `OpenTopoDataElevacionClient`, `NasaPowerHumedadClient` |
| `rotaciones` | Motor: ventanas por temporadas, 4 pasos en 2 años, estrategias A/B/C/D, 12 reglas, puntajes, evidencia, calendario y oportunidades. | Las de `clima` y `terreno` + catálogo. | — |
| `impresion` | Ticket ESC/POS de 32 columnas con aptitud, clima, estrategias y fuentes. | Impresora compartida `\\localhost\XP58`. | `EscPosWindowsPrinter` |
| transversales | `auditoria` (`IAuditor`, solo en `crearFinca`), `mcp-audit`, `shared` (caché `cache_proveedores`, `AreaSeleccionada`, geometría). | — | `MySqlAuditor`, `MySqlCacheProveedores` |

AppEEARS **no se usa**: el plan anterior lo proponía para la elevación, pero se reemplazó por OpenTopoData (síncrono).
Por eso no hay esperas a AppEEARS en el código.

## 3. Qué quedó incompleto frente al plan anterior

1. **Autopista del E2E**: falla por Overpass (8 s y 1 ronda tras el cambio del usuario; los espejos públicos tardan
   ~21 s o no responden). La regla está probada en los tests de `core`, pero en vivo depende de Overpass.
2. **Catálogo sin fuentes verificadas**: los 51 cultivos llevan `AVISO_VERIFICACION`; ninguna cifra tiene una URL o
   tabla concreta. Las plagas (`plagasClave`) no tienen fuente.
3. **Ingreso inventado**: `referencias-ingreso.ts` asigna alta/media/baja por grupo (por ejemplo, "media" para
   leguminosas, forrajes y oleaginosas sin dato propio) y lo convierte en 90/60/30 puntos. No hay precios, costos ni
   rendimientos detrás.
4. **IDEAM solo Boyacá**: `IdeamNormalesClient` se crea con `departamentos: ["Boyacá"]`; el resto de Colombia queda sin
   calibrar aunque el plan decía "IDEAM en Colombia".
5. **Pendiente** solo en el centro del lote (5 puntos SRTM), no en toda el área.
6. **Sin `Server-Timing` ni mediciones**: no hay forma de saber qué proveedor tarda.

## 4. Violaciones de arquitectura

Revisión con `grep` de las 7 Reglas de Oro:

- `core` no importa `drizzle-orm`, `mysql2`, `hono`, `jose`, `argon2`, `nodemailer` ni usa `Deno.*`, `fetch`, `throw`,
  `setTimeout` o `new Date()` (solo aparecen en comentarios). ✔
- Ninguna instancia de repositorio o cliente fuera de `composition`. ✔
- `platform` no importa `database`. ✔
- Todos los controladores y tools validan con Zod (el único archivo sin esquema es el índice de tools). ✔
- **Observación (no violación):** `AnalizarTerrenoUseCase` guarda estado en memoria (`enVuelo`) para deduplicar; es
  aceptable porque no es estado de negocio, pero en v2 la deduplicación se mueve a la caché de `platform`.
- **Observación:** el texto de explicaciones (`explicar-estrategia.service.ts`, `evidencia-reglas.ts`) mezcla cifras
  calculadas con cifras escritas a mano (25 %, 32 °C, 50 %, 5 días): son umbrales del sistema, pero no viajan como dato
  con fuente. En v2 cada cifra mostrada se arma desde un `DatoConFuente`.

## 5. Causas de lentitud visibles en el código

| # | Causa | Dónde | Efecto medido / esperado |
| :-- | :-- | :-- | :-- |
| L1 | **Caché por coordenada exacta**: NASA POWER usa `toFixed(3)` (~100 m) aunque su celda mide 0,5° × 0,625° (~55 × 70 km). Dos clics a 200 m vuelven a descargar 30 años diarios. | `nasa-power-client.ts` (`clave`) | Cada punto nuevo paga la descarga completa (5–20 s). |
| L2 | **Serie diaria de 30 años en el camino crítico**: 11 000 días × 4 variables para el primer resultado, aunque para el resumen basta la climatología mensual. | `obtener-perfil-climatico.use-case.ts` | Primer resultado ≥ tiempo de POWER diario. |
| L3 | **Calibración IDEAM en serie**: tras la serie del sitio se descarga en serie la serie POWER de la estación (otra de 30 años), en cada consulta, aunque los factores de una estación no cambian. | `calibrarConBusqueda` | Suma una segunda descarga larga en cada punto colombiano nuevo. |
| L4 | **Catálogo IDEAM** (Socrata) en la primera consulta colombiana, timeout de 60 s. | `ideam-normales-client.ts` | Primera consulta de Colombia lenta. |
| L5 | **NDVI**: 5 años en bloques con 20 s de timeout y 2 reintentos; clave `toFixed(4)` (~11 m) aunque el píxel mide 250 m. | `ornl-modis-client.ts` | Nakuru y Córdoba: ~70 s en frío. |
| L6 | **Overpass**: 8 s y 1 ronda (cambio del usuario) → no detecta vías; antes eran 4 espejos × 3 rondas × 25 s = minutos. Clave por caja exacta de 5 decimales. | `overpass-vias-client.ts` | O lento o ciego. |
| L7 | **Humedad del suelo**: otra petición diaria a POWER (`GWET*`) con 60 s de timeout. | `nasa-power-humedad-client.ts` | Compite con L2 por el mismo servicio. |
| L8 | **Motor**: recorrido en profundidad con hasta 11 candidatos por paso (11⁴ = 14 641 secuencias) y cada hoja llama `evaluarSecuencia` completo; se repite para B, C, D y sus reintentos. No garantiza el óptimo (poda por heurística). | `generar-estrategias.service.ts` | Decenas a cientos de ms; resultado distinto del exhaustivo. |
| L9 | **Terreno duplicado**: el Frontend pide `/terreno/analizar` y `/rotaciones/comparar` en paralelo, y `comparar` vuelve a analizar el terreno (se deduplica solo mientras ambas están en vuelo). | `use-explorar.ts`, `motor-rotaciones.ts` | Doble trabajo si no coinciden en el tiempo. |
| L10 | **Elevación**: clave por los 5 puntos exactos (`toFixed(5)`). | `opentopodata-elevacion-client.ts` | Sin reutilización entre clics vecinos. |

## 6. Causas posibles de bloqueos ("se queda cargando")

| # | Causa | Dónde |
| :-- | :-- | :-- |
| B1 | **Sin tiempo máximo por petición**: POWER tiene 90 s, IDEAM 60 s, humedad 60 s; ORNL reintenta. Una petición puede durar minutos. | `nasa-power-client.ts`, `ideam-normales-client.ts`, `ornl-modis-client.ts` |
| B2 | **Frontend sin AbortController ni debounce**: cada clic dispara dos POST que siguen vivos en el servidor aunque el usuario ya cambió de punto; solo se ignora la respuesta vieja (`peticionRef`). | `use-explorar.ts`, `http-client.ts` |
| B3 | **Sin vigilante en la interfaz**: el contador de segundos sube sin límite; no hay "Reintentar" ni "Cancelar" al tardar. | `use-explorar.ts` |
| B4 | **Límite por IP** de 30 peticiones/min a proveedores externos: clics seguidos pueden devolver 429 y la interfaz lo muestra como error genérico. | `apps/api/src/middlewares/proteccion.ts` |
| B5 | **Pool MySQL sin `queueLimit` ni timeout de conexión**: si MySQL no responde, la caché espera indefinidamente antes de seguir. | `database/src/connection.ts` |
| B6 | **Errores de caché tragados** sin tiempo: `obtenerConCache` espera la caché persistente antes de cargar. | `cache-en-memoria.ts` |

## 7. Problemas nuevos encontrados (agregados como tareas)

| Problema | Fase donde se resuelve |
| :-- | :-- |
| ECOCROP sí es descargable completo (FAO ECOCROP, mirror OpenCLIM, 2 568 especies, SHA-256 `4187e884…`): los valores del catálogo difieren del ECOCROP real (p. ej. trigo T óptima 10–24 en el código vs **15–23** en ECOCROP; papa 15–20 vs **15–25**). | 2.5: el catálogo se regenera desde `Docs/fuentes/ecocrop_extracto.tsv`. |
| FAOSTAT (valor bruto de la producción por hectárea, I$ constantes 2014-2016, 2018-2022) reemplaza la referencia de ingreso inventada. | 2.5 (`Docs/fuentes/faostat_valor_bruto_por_ha.tsv`). |
| La facelia no está en ECOCROP. | 2.5: queda `sin_fuente` y fuera de las decisiones. |
| `plagasClave` sin fuente. | 2.5: se dejan de mostrar como dato. |
| IDEAM limitado a Boyacá. | 2.8: el precálculo de Colombia necesita todas las estaciones; se amplía a todos los departamentos. |
| "Ajustes al altiplano" del catálogo: ya no existen en el código (se eliminaron en la fase 5 global); solo quedan menciones en comentarios. | — (documentado en `ORIGEN_DE_LAS_RESPUESTAS.md`). |
