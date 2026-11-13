# 📦 Módulo `rotaciones`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.

---

## 🎯 Propósito

Motor que compara **3 o 4 estrategias de rotación de 2 años** para **cualquier lugar del mundo** (o una finca
guardada), expresadas en las **temporadas reales del sitio**, con evidencia y su fuente, beneficios, vacíos de
información, riesgos, un **calendario de 12 meses** (baldío / vulnerable / oportunidad) y **oportunidades**.

> **Sugiere y explica; no reemplaza el criterio del agricultor ni del agrónomo.** Solo usa datos con fuente: no inventa cifras.
> Lo que FAO ECOCROP no trae (`camposSinFuente` del cultivo) **no se usa para decidir**.

## 🧭 Flujo (`MotorRotaciones`, servicio de aplicación)

`comparar(datos, contexto, previos?)`. `previos` = `{ terreno?, perfil?, presencia? }`: si el llamador ya tiene el
terreno, el perfil climático o la presencia local, **no se repiten las consultas**.

1. Catálogo y secuencia actual (claves válidas). `datosComparacion.cultivoActual` es **opcional** (`string | null`).
2. **Terreno** (`IAnalisisTerrenoQuery` ← `AnalizarTerrenoUseCase`): si no es apto → `TERRENO_NO_APTO`
   ("No se puede sembrar: es carretera"…) y **no hay rotaciones**.
3. Altitud: la del usuario / finca → SRTM → celda del clima.
4. **Clima** (`IPerfilClimaticoQuery.porUbicacion` ← `ObtenerPerfilClimaticoUseCase`): temporadas derivadas,
   vulnerabilidad, déficit hídrico.
5. **Ventanas** (`construirVentanas`): 2 temporadas/año → 2 ventanas; 1 temporada/año → temporada + **intervalo**
   (invierno o estación seca: solo coberturas viables o **barbecho**). Horizonte: 2 años (4 pasos).
6. **Estrategias**: A actual **sin corregir** (solo si hay cultivo actual) · B suelo (incluye el cultivo principal si es
   viable) · C forraje / ingreso · D agua (si prioridad agua ≥ 4, hay déficit hídrico **o no hay cultivo actual**).
   Con cultivo actual: A, B, C y D opcional. **Sin cultivo actual: no hay A, no se exige cultivo principal y siempre
   salen B, C y D** (≥ 3). B, C y D son **anuales** (salvo que el cultivo actual sea perenne) y **siempre distintas**.
7. Explicación por estrategia, calendario y oportunidades.

## 🧩 Dominio (puro, determinista)

| Servicio | Qué hace |
| :--- | :--- |
| `ventanas-rotacion.service.ts` | Ventanas del año a partir de las temporadas reales. |
| `evaluar-paso.service.ts` | Un cultivo (o barbecho) en una ventana: **elige el mes de siembra** de menor riesgo dentro de la ventana, temperatura media del ciclo y aptitud ECOCROP, lluvia y déficit, helada **frecuente** (probabilidad ≥ `PROBABILIDAD_RIESGO_HELADA` y ≥ `DIAS_HELADA_EXPOSICION` días/mes) y calor; si el ciclo no cabe pero sí con la ventana siguiente, la ocupa (maíz de altura, tarwi, yuca). Define `ContextoMotor` (incluye `presencia` y `escalaIngreso`) y `PasoEvaluado` (incluye `presencia`). |
| `presencia-motor.ts` | `PresenciaMotor` (nivel local / poco común / sin datos, área y valor por ha), `PRESENCIA_DESCONOCIDA`, `calcularEscalaIngreso`, `puntajeIngresoLogaritmico`. |
| `generar-estrategias.service.ts` | **Búsqueda exacta** (ver abajo): `buscarMejorSecuencia`, `buscarMejorSecuenciaExhaustiva` (solo para tests), `evaluarSecuencia`, `pasoEsViable`. |
| `enfoques-rotacion.ts` | Función de puntuación, **cota superior admisible** y heurística de las estrategias B, C y D (`ENFOQUES_ROTACION`). |
| `reglas-rotacion.service.ts` | 12 reglas: `no_sembrar_en_carretera`, `no_repetir_familia`, `leguminosa_cada_dos_anios`, `siembra_en_temporada`, `temperatura_apta`, `evitar_helada`, `tolerancia_calor`, `agua_suficiente`, `ciclo_cabe_en_ventana`, `suelo_compatible`, `cobertura_en_pendiente` (> `PENDIENTE_FUERTE_PCT`), `aprovechar_baldio`. |
| `puntajes-rotacion.service.ts` | Agua, suelo (cobertura + N + raíz), plagas (repeticiones y familia dominante), forraje e ingreso (FAOSTAT, ver abajo). Exporta `calcularPuntajes(evaluados, ctx)` y `puntajesDeUnPaso(ev, ctx)`. |
| `explicar-estrategia.service.ts` + `evidencia-reglas.ts` | porQue, evidencia con fuente (NASA POWER, IDEAM, MODIS, SoilGrids, SRTM, OpenStreetMap, ECOCROP con su **EcoPortCode**, Regla, Agricultor), beneficios, vacíos, riesgos. **Ninguna cifra va escrita a mano en los textos**: se insertan desde la constante que la define. Cada regla declara su respaldo (documentada / práctica habitual / calculada). |
| `calendario-oportunidades.service.ts` | Calendario de 12 meses y oportunidades (funciona sin estrategia A). |

## 🧮 Criterios del sistema (se documentan aquí porque no son datos de una fuente)

### Datos sin fuente (`camposSinFuente`)
- `toleranciaHelada` sin fuente (ECOCROP no trae temperatura letal): si el ciclo pasa por meses de helada frecuente →
  riesgo **alto** (no viable) con la nota «Sin temperatura letal en FAO ECOCROP: no se recomienda en meses con helada».
  Sin exposición → «ninguno».
- `texturas` sin fuente → `texturaCompatible` devuelve `null`: la regla de suelo no la usa.
- `valorForrajero` / `coberturaSuelo` sin fuente → aportan **0** al puntaje y la estrategia agrega el vacío
  «Sin dato de <campo> en FAO ECOCROP para <cultivo>».
- Temperatura, ciclo o agua del ciclo sin fuente → el cultivo **no es viable** (`Cultivo.sinDatosDeViabilidad`).

### Ingreso (sin precios ni datos inventados)
`ingreso(cultivo) = 100 × (ln(v) − ln(vmin)) / (ln(vmax) − ln(vmin))`, acotado a 0–100, donde `v` es el **valor bruto de
la producción por hectárea** (`presencia.valorHa(clave)`, FAOSTAT del país o, si no hay, del mundo) y `vmin` / `vmax` el
mínimo y el máximo de `v` entre los cultivos del catálogo con dato (`calcularEscalaIngreso`; si solo hay un valor, 50).
- **Solo si el cultivo tiene presencia «local»**. Sin valor o sin presencia local → ingreso `null` («sin datos»): aporta 0 y
  la estrategia agrega el vacío «Ingreso sin datos: <cultivo> (<motivo>)».
- El ingreso de una secuencia es el promedio de sus pasos (barbecho y «sin datos» cuentan 0). No incluye costos,
  precios locales ni el rendimiento del lote.

### Presencia local («poco común»)
Los pasos llevan `presencia` (`local` / `poco_comun` / `sin_datos`). En B, C y D la función de puntuación resta
**20 × (pasos sembrados poco comunes / pasos sembrados)** (criterio del sistema: no se prefiere lo que casi nadie siembra
en la zona). Si una estrategia incluye un cultivo poco común, `riesgos` trae exactamente
`ADVERTENCIA_POCO_COMUN + " (" + nombre + ")"`. La estrategia **C nunca pone como primer cultivo sembrado uno poco común**
si existe una alternativa viable (opción `evitarPocoComunPrimero`; si no hay alternativa, se relaja).

### Búsqueda exacta (sin poda heurística)
1. **Prefiltro de época**: por paso solo quedan los cultivos viables (reglas duras de un solo paso).
2. **Ramificación y acotamiento**: recorrido en profundidad (no repetir familia, ≥ 1 leguminosa, continuaciones, secuencias
   no excluidas). En cada nodo se calcula una **cota superior admisible** del puntaje del enfoque: agua / suelo / forraje /
   ingreso son promedios por paso → cota = parcial + máximo posible de los pasos restantes (incluye continuaciones y
   barbecho); plagas solo puede bajar al sumar pasos → se usa la de los pasos fijados; el bono de aptitud usa la fracción
   máxima alcanzable (≤ 25); las penalizaciones usan su mínimo seguro (suelo incompatible ya presente, fracción poco común
   ≥ la de los pasos fijados). El redondeo es monótono y se aplica a la cota igual que al puntaje; solo se poda con
   cota **estrictamente menor** que la mejor secuencia. Los candidatos se exploran por la heurística del enfoque.
3. **Desempate**: puntaje del enfoque (redondeado a 1e-6) → `puntajeTotal` → orden alfabético de la secuencia.
4. El resultado es **idéntico** al recorrido exhaustivo (`buscarMejorSecuenciaExhaustiva`); `tests/rotaciones/equivalencia-motor.test.ts`
   lo comprueba en 20 casos deterministas.

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
- Para el módulo `recomendacion`: `evaluarPaso`, `puntajesDeUnPaso`, `calcularPuntajes`, `pasoEsViable`,
  `mesesHeladaFrecuente`, `construirVentanas`, `calcularEscalaIngreso`, `PresenciaMotor`, `PRESENCIA_DESCONOCIDA`.

## ⚠️ Limitaciones

- Los pesos de los puntajes y las penalizaciones (−20 poco común, −6 suelo, bono de aptitud 25) son **criterios del sistema**,
  no datos: validar con agrónomo local.
- El ingreso es el valor bruto de producción por ha (FAOSTAT): no incluye costos ni precios locales.
- ET0 por Hargreaves (solo temperaturas): en trópico húmedo de montaña tiende a sobreestimar el déficit.
