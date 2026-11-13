# Origen de las respuestas (estado antes de la v2)

> Para cada dato que ve el usuario en la recomendación, el detalle y el ticket: archivo y función, fuente, y tipo.
> **Tipo**: *medido* (sale de un sensor o una base pública), *calculado* (fórmula sobre datos medidos), *estimado*
> (supuesto razonable sin medición) y *fijo en código* (número o texto escrito a mano).
> **⚠ SIN FUENTE** marca lo que no tiene una fuente verificable (URL, tabla o DOI). La v2 lo corrige: ver la última
> columna y la sección final.

Rutas relativas a `Backend/packages/core/src/modules/`.

## 1. Recomendación (comparación de rotaciones)

| Campo mostrado | Archivo · función | Fuente | Tipo | Estado / acción v2 |
| :-- | :-- | :-- | :-- | :-- |
| Aptitud y mensaje ("No se puede sembrar: es carretera") | `terreno/domain/services/aptitud-terreno.service.ts` · `decidirAptitud`, `evaluarAfectacion` | OSM (Overpass) + MODIS MCD12Q1 | calculado | Anchos por tipo de vía `ANCHO_TIPICO_VIA_M` (motorway 12 m, primary 8 m…) **⚠ SIN FUENTE** ("valores de referencia del plan"). v2: se citan como criterio del sistema con nota y se reporta como vacío. |
| Clasificación climática | `clima/domain/services/clasificacion-climatica.service.ts` | NASA POWER | calculado | Umbrales 18 °C y 6 °C (criterio Köppen simplificado) sin cita → v2 cita Köppen-Geiger (Kottek et al. 2006). |
| Lluvia anual, T media, ET0 | `clima/.../obtener-perfil-climatico.use-case.ts` · `porUbicacion`; `evapotranspiracion.service.ts` | NASA POWER (+ IDEAM) | medido / calculado (Hargreaves, FAO-56 ec. 52) | Con fuente. v2: viajan como `DatoConFuente`. |
| Meses de helada | `calendario-climatico.service.ts` (`UMBRAL_HELADA_C = 2`, `PROBABILIDAD_RIESGO_HELADA = 0.25`) | NASA POWER | calculado con umbral fijo | Umbral de 2 °C de aire y 25 % de años: **criterio del sistema** sin cita. v2: se declaran como criterio, con nota. |
| Meses de calor | `UMBRAL_CALOR_C = 32`, `DIAS_CALOR_MES_CRITICO = 5` | NASA POWER | calculado con umbral fijo | Criterio del sistema sin cita. Ídem. |
| Meses de déficit | `resumen-climatico.service.ts` (`FRACCION_DEFICIT = 0.5`: lluvia < 50 % de ET0) | NASA POWER | calculado | Criterio del sistema (análogo al periodo de crecimiento de FAO, lluvia ≥ 0,5 ET0). v2: cita FAO (1978) Agro-ecological Zones. |
| Temporadas y ventanas | `temporadas-cultivo.service.ts`, `rotaciones/.../ventanas-rotacion.service.ts` | NASA POWER | calculado | Umbrales 5 °C, 0 °C, 15 días, 3 meses, 10 meses: criterio del sistema (5 °C y 0,5 ET0 siguen el periodo de crecimiento FAO-AEZ). |
| Secuencia de cada estrategia | `rotaciones/domain/services/generar-estrategias.service.ts` · `buscarMejorSecuencia`; `application/use-cases/motor-rotaciones.ts` | Catálogo + clima | calculado | Poda heurística (`MAX_CANDIDATOS = 9`) no garantiza el óptimo. v2: búsqueda acotada exacta. |
| Puntaje de agua / suelo / plagas / forraje | `puntajes-rotacion.service.ts` (`PUNTAJE_AGUA`, `PUNTAJE_COBERTURA`, `PUNTAJE_RAIZ`, `PUNTAJE_FORRAJE`, `SUELO_BARBECHO = 15`, −30 / −15 por familia) | Catálogo | **fijo en código** | Pesos de modelo **⚠ SIN FUENTE**. v2: documentados como criterio del sistema en `MODULE.md`; las entradas pasan a ECOCROP. |
| **Puntaje de ingreso** | `referencias-ingreso.ts` · `nivelIngresoReferencia` (por grupo; p. ej. leguminosa, forraje, oleaginosa y pseudocereal → **"media"**; excepciones a mano) y `PUNTAJE_INGRESO` alta 90 / media 60 / baja 30 | Ninguna | **inventado** | **⚠ SIN FUENTE**. v2: se elimina; el ingreso pasa a ser el valor bruto de la producción por hectárea de FAOSTAT (`Docs/fuentes/faostat_valor_bruto_por_ha.tsv`); sin dato FAOSTAT = "Sin datos de FAOSTAT". |
| Premio por temperatura óptima | `motor-rotaciones.ts` (`BONO_APTITUD_OPTIMA = 25`) y heurísticas por enfoque (0,5 / 0,3 / 0,2…) | — | fijo en código | Criterio del sistema; documentado en `MODULE.md`. |
| Prioridades de la estrategia D | `PRIORIDAD_AGUA_ESTRATEGIA_D = 4` | — | fijo | Criterio del sistema. v2: objetivos fijos documentados. |
| Exposición a helada del cultivo | `evaluar-paso.service.ts` (`DIAS_HELADA_EXPOSICION = 2`) | NASA POWER | calculado con umbral fijo | Criterio del sistema. |
| Déficit de agua tolerado | `generar-estrategias.service.ts` (`DEFICIT_AGUA_MAXIMO = 0.3`) | — | fijo | **⚠ SIN FUENTE**. v2: el agua del ciclo se compara con `RMIN` / `ROPMN` de ECOCROP en la temporada (modelo EcoCrop, Hijmans et al. 2001). |
| "Por qué" de cada estrategia | `explicar-estrategia.service.ts` · `construirPorQue` | Puntajes calculados | plantilla con cifras calculadas | Correcto, pero mezcla cifras de umbrales escritas a mano. v2: plantillas con `DatoConFuente`. |
| Evidencia | `explicar-estrategia.service.ts` · `construirEvidencia` + `evidencia-reglas.ts` (`EVIDENCIA_REGLAS`) | FAO Save and Grow, SARE, ICA, FAO 2000 | texto fijo + cifras calculadas | Los textos de las reglas citan documentos sin página ni URL, y repiten cifras a mano (25 %, 32 °C, 5 días, 50 %). **⚠ cifras sin `DatoConFuente`**. v2: las cifras se insertan desde las constantes con su `DatoConFuente`. |
| Beneficios, riesgos, vacíos | `explicar-estrategia.service.ts` · `construirBeneficios`, `explicarEstrategia`; `VACIOS_GENERALES`, `RIESGOS_GENERALES` | Catálogo + reglas | plantilla | Correcto (sin cifras inventadas), pero derivan de tolerancias del catálogo sin fuente. |
| Oportunidades | `calendario-oportunidades.service.ts` · `detectarOportunidades` | NDVI, clima, catálogo | calculado | "sumar_ingreso" usa el ingreso inventado → v2 FAOSTAT. |

## 2. Catálogo de cultivos (`database/src/catalogos/catalogo-cultivos.datos.ts`)

| Campo | Fuente declarada | Tipo | Estado / acción v2 |
| :-- | :-- | :-- | :-- |
| `temperaturaOptimaC`, `temperaturaAbsolutaC` | "estilo FAO ECOCROP", de memoria del subagente | estimado | **⚠ SIN FUENTE** (difieren de ECOCROP real). v2: `TOPMN/TOPMX/TMIN/TMAX` de ECOCROP por `EcoPortCode`. |
| `lluviaAnualOptimaMm` | ídem | estimado | **⚠ SIN FUENTE**. v2: `ROPMN/ROPMX`. |
| `aguaCicloMm` | ídem | estimado | **⚠ SIN FUENTE**. v2: `RMIN`/`ROPMN` de ECOCROP aplicados a la lluvia del ciclo (modelo EcoCrop). |
| `phOptimo` | ídem | estimado | **⚠ SIN FUENTE**. v2: `PHOPMN/PHOPMX`. |
| `cicloDias` | ídem | estimado | **⚠ SIN FUENTE**. v2: `GMIN/GMAX`. |
| `texturas` | ídem | estimado | **⚠ SIN FUENTE**. v2: `TEXT` (heavy/medium/light → arcillosa/franca/arenosa). |
| `profundidadRaiz` | ídem | estimado | **⚠ SIN FUENTE**. v2: `DEP` (profundidad de suelo requerida; se rotula así). |
| `toleranciaHelada` | ídem | estimado | **⚠ SIN FUENTE**. v2: calculada desde la temperatura letal `KTMP/KTMPR`; sin dato → el cultivo no se recomienda en meses con helada (exclusión conservadora) y se informa. |
| `toleranciaCalor`, `toleranciaSequia`, `necesidadAgua` | ídem | estimado | **⚠ SIN FUENTE**. v2: calculadas desde `TMAX`, `RMIN`, `ROPMN` con umbrales documentados. |
| `fijaNitrogeno`, `familias` | botánica | referencia | v2: familia desde `FAMNAME` de ECOCROP (Leguminosae → fija N). |
| `valorForrajero`, `coberturaSuelo` | ídem | estimado | **⚠ SIN FUENTE**. v2: categoría `CAT` de ECOCROP ("forage/pasture", "cover crop"); sin categoría = sin dato. |
| `plagasClave` | ídem | estimado | **⚠ SIN FUENTE**. v2: no se muestran. |
| `confianza` | asignada por el subagente | estimado | v2: se reemplaza por la fuente concreta de cada valor. |
| "Ajustes al altiplano" | — | — | Ya no existen en el código (se quitaron en la fase 5 global). |
| Facelia | — | — | No está en ECOCROP → `sin_fuente`, excluida de las decisiones. |

## 3. Detalle (perfil del terreno)

| Campo | Archivo · función | Fuente | Tipo |
| :-- | :-- | :-- | :-- |
| Vías cercanas, % excluido | `terreno/.../aptitud-terreno.service.ts` · `evaluarAfectacion` | OSM | calculado |
| Cobertura MODIS | `analizar-terreno.use-case.ts`; `CLASES_IGBP` | MODIS MCD12Q1 | medido |
| NDVI, meses baldíos, estrés | `ndvi.service.ts` (`FRACCION_BALDIO 0.6`, `NDVI_MAXIMO_BALDIO 0.4`, `ANOMALIA_ESTRES 0.1`) | MODIS MOD13Q1 | calculado con umbrales **⚠ sin cita** → v2: criterio del sistema con nota. |
| Suelo (pH, arena, arcilla, carbono, N) y textura | `suelo-relieve.service.ts` · `clasificarTextura` | SoilGrids | medido (modelo 250 m) / calculado (triángulo USDA) |
| Elevación y pendiente | `suelo-relieve.service.ts` · `calcularPendientePct` | SRTM (OpenTopoData) | medido / calculado |
| Humedad del suelo | `analizar-terreno.use-case.ts` | NASA POWER `GWET*` | medido |
| Advertencias de proveedor caído | `analizar-terreno.use-case.ts` | — | texto; el dato queda vacío (correcto). |

## 4. Ticket (`impresion/domain/services/componer-ticket.service.ts` · `componerTicketTerreno`)

| Línea | Fuente | Tipo |
| :-- | :-- | :-- |
| Aptitud | módulo `terreno` | calculado |
| Clima (lluvia, T media, régimen) | `clima` | medido / calculado |
| Estrategias con puntaje y "mejor puntuada" | `rotaciones` | calculado, incluye el ingreso inventado ⚠ |
| Oportunidad | `rotaciones` | calculado |
| Fuentes | `terreno.fuentes` | lista |
| "Herramienta de apoyo. Validar con agrónomo local." | `AVISO_TICKET` | fijo (texto legal, correcto) |

## 5. Resumen de lo que no tiene fuente verificable (y cómo se corrige en la v2)

1. Catálogo completo (temperaturas, lluvia, agua del ciclo, pH, ciclo, texturas, tolerancias, forraje, cobertura,
   plagas) → **ECOCROP** (`Docs/fuentes/ecocrop_extracto.tsv`, `EcoPortCode` por cultivo).
2. Ingreso (incluido el "media" por defecto) → **FAOSTAT** (`Docs/fuentes/faostat_valor_bruto_por_ha.tsv`).
3. Pesos de puntajes y umbrales del sistema (helada 2 °C / 25 %, calor 32 °C / 5 días, déficit 50 % ET0, baldío 60 % /
   0,40, pendiente 25 %, anchos de vía) → no son datos del mundo sino **criterios del sistema**: se documentan en
   `MODULE.md`, viajan con `tipo: "referencia"` y una nota, y `scripts/auditar-datos.ts` exige que cada uno esté en la
   lista de criterios justificados.
4. Textos de evidencia con cifras escritas a mano → plantillas que insertan las cifras desde `DatoConFuente`.
