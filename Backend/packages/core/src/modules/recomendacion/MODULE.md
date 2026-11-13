# Módulo `recomendacion` — qué sembrar en cada época del año

Responde, para un punto o un polígono de hasta 100 ha en cualquier lugar del mundo: ¿se puede sembrar aquí?, ¿cómo es
el año (épocas)? y ¿qué sembrar en cada época según el objetivo del agricultor? Sugiere y explica; no reemplaza al
agricultor ni al agrónomo.

## Casos de uso

| Caso de uso | Archivo | Qué hace |
| :-- | :-- | :-- |
| `RecomendarPorEpocaUseCase` (etapa **rápida**) | `application/use-cases/recomendar-por-epoca.use-case.ts` | Aptitud (OSM + MODIS), clima resumido (serie diaria si está en caché o precálculo; si no, climatología mensual de NASA en ≤ `ESPERA_SERIE_DIARIA_MS`), épocas y qué sembrar para **los 4 objetivos** (cambiar de objetivo no hace otra petición). |
| `RecomendacionDetalleUseCase` (etapa de **detalle**) | `application/use-cases/recomendacion-detalle.use-case.ts` | Terreno completo (suelo, NDVI, elevación, pendiente), clima mes a mes con la serie diaria, calendario de vulnerabilidad y **3 o más estrategias** del motor de rotaciones con por qué, evidencia, beneficios, vacíos y riesgos. |

Ambos: plazo total `PLAZO_MAXIMO_PETICION_MS` (25 s, contrato): lo que no llega a tiempo queda "Sin datos de …" con
advertencia; nunca se cuelgan (test `cargas-sin-bloqueo.test.ts`). Reportan el avance por `IReportadorProgreso`
(eventos de la pantalla de carga). Solo lectura: no auditan (Regla 6).

## Servicios de dominio

- `epocas.service.ts` · `derivarEpocas(perfil, origen)`: cada mes recibe un tipo (en este orden): **invierno**
  (T media < `TEMP_MINIMA_CRECIMIENTO_C`), **heladas** (helada frecuente: probabilidad ≥ `PROBABILIDAD_RIESGO_HELADA` y
  ≥ `DIAS_HELADA_EXPOSICION` días), **seca** (lluvia < `FRACCION_DEFICIT` × ET0), **calor** (≥ `DIAS_CALOR_MES_CRITICO`
  días con máxima ≥ `UMBRAL_CALOR_C`), **lluviosa** (lluvia ≥ promedio mensual) y **templada**. Meses seguidos del mismo
  tipo forman una época (año circular). Sirve en ambos hemisferios y en cualquier régimen.
- `recomendar-epoca.service.ts` · `recomendarPorEpoca(...)`: evalúa sembrar cada cultivo al inicio de cada época con las
  reglas duras del motor de rotaciones (temperatura ECOCROP, helada, calor, agua del ciclo sin riego, ciclo) y lo puntúa
  con `puntajesDeUnPaso` y los pesos del objetivo.

## Perfiles FIJOS de los 4 objetivos (`PESOS_OBJETIVO`, contrato `recomendacion.schema.ts`)

Criterio del sistema (no es un dato del mundo). Pesos de 1 a 5:

| Objetivo | Agua | Suelo | Plagas | Forraje | Ingreso |
| :-- | --: | --: | --: | --: | --: |
| Equilibrado | 3 | 3 | 3 | 3 | 3 |
| Mejorar el suelo | 2 | 5 | 4 | 2 | 2 |
| Ahorrar agua | 5 | 3 | 2 | 2 | 2 |
| Más ingreso | 2 | 2 | 3 | 2 | 5 |

Puntaje de un cultivo en una época = promedio ponderado de sus puntajes 0–100. Un puntaje **sin datos** aporta 0 con su
peso (no se rellena). "Plagas" mide si rompe la familia del cultivo anterior (el actual del lote o el recomendado en la
época anterior) y no cuenta si no hay cultivo anterior.

## Presencia local (pedido del usuario: "cultivos que se siembran en la zona")

- Puerto `IPresenciaLocalProvider` (`application/ports/index.ts`), implementado en
  `platform/src/presencia/presencia-local-client.ts` con caché en archivos:
  - Colombia: **EVA** (Evaluaciones Agropecuarias Municipales, datos.gov.co `uejq-wxrr` y `2pnw-mmge`), área sembrada
    promedio anual 2015-hoy en los municipios cuyo centroide (DIVIPOLA) está a ≤ `RADIO_ZONA_KM` (25 km, criterio).
  - Fuera de Colombia: **FAOSTAT**, área cosechada del país (2018-2022).
- Regla: la primera recomendación de cada época es un cultivo con presencia **local**; uno **poco común** solo puede
  ser la alternativa, con `ADVERTENCIA_POCO_COMUN`; en **Más ingreso** la primera debe ser local y tener dato de
  ingreso. Si la fuente no responde, nada se marca local y el ingreso queda "sin datos".
- Ingreso: valor bruto de la producción por ha de FAOSTAT (país o mundo), solo con presencia local (ver MODULE.md de
  rotaciones para la escala).

## Errores

| Código | Cuándo |
| :-- | :-- |
| `AREA_INVALIDA`, `AREA_DEMASIADO_GRANDE` | El área no es válida o supera 100 ha. |
| `ROTACION_CULTIVO_DESCONOCIDO` | El cultivo actual no está en el catálogo. |
| `RECOMENDACION_SIN_CLIMA` | NASA POWER no respondió (ni serie diaria ni climatología) en un sitio apto. |
| `PRESENCIA_LOCAL_NO_DISPONIBLE` | EVA no respondió (no corta la recomendación: queda como vacío de información). |

## Archivos por capa

- contracts: `Shared/contracts/src/recomendacion.schema.ts`, `dato.schema.ts` (DatoConFuente).
- core: este módulo; usa `clima`, `terreno`, `rotaciones` y `cultivos`.
- platform: `presencia/presencia-local-client.ts`, `nasa-power-climatologia-client.ts`, `temporizador-sistema.ts`.
- api: `controllers/recomendacion.controller.ts`, `routes/recomendacion.routes.ts` (`/rapida`, `/detalle`, `/flujo` NDJSON).
- mcp: `tools/recomendacion.tools.ts` (`recomendacion_por_epoca`). Http: `Http/recomendacion.http`.
- tests: `core/tests/recomendacion/` (recomendacion, datos-veridicos, cargas-sin-bloqueo).
