# 📦 Módulo `rotaciones`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.

---

## 🎯 Propósito

Motor que compara **3 o 4 estrategias de rotación de 2 años** para **cualquier lugar del mundo** (o una finca
guardada), expresadas en las **temporadas reales del sitio**, con evidencia y su fuente, beneficios, vacíos de
información, riesgos, un **calendario de 12 meses** (baldío / vulnerable / oportunidad) y **oportunidades**.

> **Sugiere y explica; no reemplaza el criterio del agricultor ni del agrónomo.** Solo usa datos calculados: no inventa cifras.

## 🧭 Flujo (`MotorRotaciones`, servicio de aplicación)

1. Catálogo y secuencia actual (claves válidas).
2. **Terreno** (`IAnalisisTerrenoQuery` ← `AnalizarTerrenoUseCase`): si no es apto → `TERRENO_NO_APTO`
   ("No se puede sembrar: es carretera"…) y **no hay rotaciones**.
3. Altitud: la del usuario / finca → SRTM → celda del clima.
4. **Clima** (`IPerfilClimaticoQuery.porUbicacion` ← `ObtenerPerfilClimaticoUseCase`): temporadas derivadas,
   vulnerabilidad, déficit hídrico.
5. **Ventanas** (`construirVentanas`): 2 temporadas/año → 2 ventanas; 1 temporada/año → temporada + **intervalo**
   (invierno o estación seca: solo coberturas viables o **barbecho**). Horizonte: 2 años (4 pasos).
6. **Estrategias**: A actual **sin corregir** · B suelo (incluye el cultivo principal si es viable) · C forraje / ingreso ·
   D agua (si prioridad agua ≥ 4 o hay déficit hídrico). B, C y D son **anuales** (salvo que el cultivo actual sea perenne)
   y **siempre distintas** entre sí y de A.
7. Explicación por estrategia, calendario y oportunidades.

## 🧩 Dominio (puro, determinista)

| Servicio | Qué hace |
| :--- | :--- |
| `ventanas-rotacion.service.ts` | Ventanas del año a partir de las temporadas reales. |
| `evaluar-paso.service.ts` | Un cultivo (o barbecho) en una ventana: **elige el mes de siembra** de menor riesgo dentro de la ventana, temperatura media del ciclo y aptitud ECOCROP, lluvia y déficit, helada **frecuente** (≥ 25 % de los años y ≥ 2 días/mes) y calor; si el ciclo no cabe pero sí con la ventana siguiente, la ocupa (maíz de altura, tarwi, yuca). |
| `generar-estrategias.service.ts` | Candidatos viables por paso (reglas duras), poda a 9 por heurística del enfoque, búsqueda en profundidad (no repetir familia, ≥ 1 leguminosa, continuaciones). |
| `reglas-rotacion.service.ts` | 12 reglas: `no_sembrar_en_carretera`, `no_repetir_familia`, `leguminosa_cada_dos_anios`, `siembra_en_temporada`, `temperatura_apta`, `evitar_helada`, `tolerancia_calor`, `agua_suficiente`, `ciclo_cabe_en_ventana`, `suelo_compatible`, `cobertura_en_pendiente` (> 25 %), `aprovechar_baldio`. |
| `puntajes-rotacion.service.ts` | Agua, suelo (cobertura + N + raíz), plagas (repeticiones y familia dominante), forraje, ingreso (referencia cualitativa por cultivo / grupo). |
| `explicar-estrategia.service.ts` + `evidencia-reglas.ts` | porQue, evidencia con fuente (NASA POWER, IDEAM, MODIS, SoilGrids, SRTM, OpenStreetMap, ECOCROP, Regla, Agricultor), beneficios, vacíos, riesgos. Cada regla declara su respaldo (documentada / práctica habitual / calculada). |
| `calendario-oportunidades.service.ts` | Calendario de 12 meses y oportunidades: baldío → cobertura, temporada más vulnerable, romper ciclo de plagas, menor demanda de agua, infiltración, ingreso. |

## ⚙️ Casos de uso

| Caso de uso | Clave en `AppContainer` | Audita |
| :--- | :--- | :--- |
| `CompararRotacionesUbicacionUseCase` | `compararRotacionesUbicacion` | ❌ (solo lectura) |
| `CompararRotacionesUseCase` (finca guardada) | `compararRotaciones` | ❌ (solo lectura) |

## ⚠️ Errores

| Código | HTTP |
| :--- | :--- |
| `TERRENO_NO_APTO` (mensaje del terreno, ej. "No se puede sembrar: es carretera") | 422 |
| `ROTACION_CULTIVO_ACTUAL_REQUERIDO`, `ROTACION_CULTIVO_DESCONOCIDO`, `ROTACION_SIN_ALTERNATIVAS`, `ROTACION_SIN_TEMPORADAS` | 422 |
| `FINCA_NO_ENCONTRADO` | 404 |

## 📁 Entradas

- `POST /api/rotaciones/comparar` `{ area, cultivoActual, secuenciaActual?, tieneRiego, prioridades, altitudM? }`
- `POST /api/rotaciones/fincas/:fincaId/comparar` `{ prioridades?, secuenciaActual? }`
- Tools MCP `rotaciones_comparar`, `rotaciones_comparar_ubicacion` · `Http/rotaciones.http`
- `deno run -A scripts/probar-rotaciones.ts <lat> <lon> <cultivo> [si|no]` (sin MySQL)

## ⚠️ Limitaciones

- Valores del catálogo, pesos de los puntajes e ingreso son de **referencia**: validar con agrónomo local.
- ET0 por Hargreaves (solo temperaturas): en trópico húmedo de montaña tiende a sobreestimar el déficit.
