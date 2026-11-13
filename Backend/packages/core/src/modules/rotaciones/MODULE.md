# 📦 Módulo `rotaciones`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.
> Se creó a mano (no con `add_module`): no guarda entidades, es un **motor de cálculo de solo lectura**.

---

## 🎯 Propósito

Comparar **3 estrategias de rotación de 2 años (4 semestres)** para una finca de Duitama, según las
prioridades del agricultor (agua, suelo, plagas, forraje, ingreso; pesos 0–5):

| Id | Enfoque | Qué es |
| :--- | :--- | :--- |
| **A** | `actual` | Lo que la finca siembra hoy, **sin corregirlo**. Se evalúa y se muestran sus incumplimientos como riesgos. |
| **B** | `suelo` | La mejor rotación de **cultivos de ciclo corto** para el suelo. Incluye el cultivo principal de la finca si es viable. |
| **C** | `forraje` | La mejor para lechería / forraje (puede ser pradera perenne). Siempre distinta de B. |

Cada estrategia trae: secuencia, por qué, evidencia, beneficios, vacíos de información, riesgos para
revisar con un agrónomo, las 7 reglas evaluadas y puntajes 0–100.

> **Sugiere y explica; no reemplaza el criterio del agricultor ni del agrónomo.**

---

## 🧩 Dominio (servicios puros y deterministas)

| Archivo (`domain/services/`) | Qué hace |
| :--- | :--- |
| `ventanas-siembra.service.ts` | Elige el mes de siembra de cada semestre: primer mes lluvioso entre **marzo/abril** y entre **septiembre/octubre** según el perfil climático. Si ninguno es lluvioso usa marzo/septiembre y lo advierte. |
| `evaluar-paso.service.ts` | Evalúa un cultivo en un semestre: meses del ciclo (ciclo medio ÷ 30), lluvia del ciclo, déficit de agua, meses de helada dentro del ciclo, riesgo de helada según tolerancia (`baja` → alto, `media` → moderado, `alta` → tolerado) y si el ciclo cabe antes de la siguiente siembra. Maneja la pradera perenne que continúa. |
| `reglas-rotacion.service.ts` | Evalúa siempre las 7 reglas (`REGLAS_ROTACION`) con detalle y semestres afectados. |
| `puntajes-rotacion.service.ts` | Puntajes 0–100 por prioridad y total ponderado con los pesos del agricultor. |
| `referencias-ingreso.ts` | Tabla **cualitativa** de ingreso (alta/media/baja). No usa precios. |
| `generar-estrategias.service.ts` | Búsqueda exhaustiva de las secuencias de 4 cultivos que cumplen las reglas duras; devuelve la mejor según una función de puntaje. Opciones: `requerirClave`, `excluirSecuencias`, `soloAnuales`. |
| `explicar-estrategia.service.ts` | Genera `porQue`, `evidencia`, `beneficios`, `vaciosInformacion` y `riesgos` **solo con datos calculados**. |
| `evidencia-reglas.ts` | Respaldo de cada regla (`documentada` / `practica_habitual` / `calculada`), fuentes y vacíos, según la investigación del 2026-11-12. |

### Reglas

| Regla | Dura (B y C deben cumplirla) | Respaldo |
| :--- | :--- | :--- |
| `no_repetir_familia` (semestres seguidos; continuar una pradera no cuenta) | ✅ | Documentada (ICA 2011): rotar la papa y eliminar toyas. **Sin cifra** de semestres sin papa. |
| `leguminosa_cada_dos_anios` | ✅ | Práctica habitual. La frecuencia "cada 2 años" es criterio del sistema. |
| `altitud_apta` | ✅ | Calculada (catálogo). |
| `evitar_helada` (ningún paso con riesgo `alto`) | ✅ | Calculada (perfil climático × tolerancia). |
| `ciclo_cabe_en_ventana` | ✅ | Calculada (ciclo medio). |
| `agua_suficiente` | Parcial: sin riego se descarta solo si el déficit supera el **30 %** del mínimo del cultivo; un déficit menor se permite pero la regla queda como incumplida y va a riesgos. | Calculada. |
| `siembra_inicio_lluvias` | No (es de la finca, no de la secuencia) | Práctica habitual. Corpoica recomienda otras fechas para papa (ene–mar y jun–ago). |

### Puntajes (promedio de los 4 semestres)

- **agua:** necesidad baja 100 · media 60 · alta 25; −25 si hay déficit y no hay riego.
- **suelo:** 0,6 × cobertura (20 / 55 / 90) + 0,4 × (fija nitrógeno ? 100 : 0).
- **plagas:** 100 − 30 × transiciones con familia repetida − 15 × (semestres con solanáceas − 1).
- **forraje:** ninguno 0 · bajo 25 · medio 60 · alto 100.
- **ingreso:** referencia cualitativa alta 90 · media 60 · baja 30.
- **total:** promedio ponderado con las prioridades (promedio simple si todas valen 0).

**Selección:** B maximiza `0,5 × suelo + 0,3 × plagas + 0,2 × total`; C maximiza
`0,6 × forraje + 0,2 × plagas + 0,2 × total`. Desempate: mayor total y luego orden alfabético de claves.

## ⚠️ Errores de Dominio

| Código | Clase | HTTP |
| :--- | :--- | :--- |
| `FINCA_NO_ENCONTRADO` | `FincaNoEncontradoError` (módulo fincas) | 404 |
| `ROTACION_CULTIVO_ACTUAL_REQUERIDO` | `RotacionCultivoActualRequeridoError` | 422 |
| `ROTACION_CULTIVO_DESCONOCIDO` | `RotacionCultivoDesconocidoError` | 422 |
| `ROTACION_SIN_ALTERNATIVAS` | `RotacionSinAlternativasError` | 422 |
| `CLIMA_*` | Se propagan tal cual desde el módulo clima | 422 |

## ⚙️ Casos de Uso

| Caso de uso | Clave en `AppContainer` | Puertos inyectados | Audita |
| :--- | :--- | :--- | :--- |
| `CompararRotacionesUseCase` | `compararRotaciones` | `IFincaRepository`, `ICultivoRepository`, `IPerfilClimaticoQuery` (lo cumple `ObtenerPerfilClimaticoUseCase`) | ❌ (solo lectura) |

---

## 📁 Archivos por Capa

### 1. Contrato — Shared/contracts
- `Shared/contracts/src/rotaciones.schema.ts` (`CompararRotacionesBodySchema`, `CompararRotacionesSchema`, `ComparacionRotacionesSchema` y sus partes)
- `mcp-tools.ts` → `ROTACIONES_COMPARAR`

### 2. Dominio — core/domain
- `domain/errors/rotacion.errors.ts`
- `domain/services/*.ts` (ver tabla de arriba)

### 3. Aplicación — core/application
- `application/ports/index.ts` (`IPerfilClimaticoQuery`)
- `application/use-cases/comparar-rotaciones.use-case.ts`
- `Backend/packages/core/tests/rotaciones/rotaciones.test.ts` (34 tests)

### 4. Infraestructura
- Ninguna propia: usa el repositorio de fincas, el catálogo de cultivos y los clientes de clima existentes.
- Relacionado: `Docs/migraciones/002_fincas_cultivo_actual_clave.sql` (`fincas.cultivo_actual` guarda la clave del catálogo).

### 5. Ensamblaje — composition
- `Backend/packages/composition/src/container.ts` → `compararRotaciones`

### 6. Entrada — apps/api y apps/mcp-server
- `Backend/apps/api/src/controllers/rotaciones.controller.ts`
- `Backend/apps/api/src/routes/rotaciones.routes.ts` → `POST /api/rotaciones/fincas/:fincaId/comparar`
- `Backend/apps/mcp-server/src/tools/rotaciones.tools.ts` → tool `rotaciones_comparar`
- `Http/rotaciones.http`
- `Backend/scripts/probar-rotaciones.ts` (prueba real sin MySQL: `deno run -A scripts/probar-rotaciones.ts 2530 papa`)

### 7. Interfaz — Frontend
- `Frontend/src/features/rotaciones/` (`api/`, `hooks/`, `types/`, `components/RotacionesVista.tsx`, `ResumenFincaClima.tsx`, `TablaComparativa.tsx`, `TarjetaEstrategia.tsx`)
- `Frontend/src/app/(panel)/rotaciones/page.tsx`
- `Frontend/src/features/cultivos/api/cultivos.api.ts`

---

## 🛠️ Forma de Uso

```http
POST /api/rotaciones/fincas/1/comparar
Content-Type: application/json

{ "prioridades": { "suelo": 5, "plagas": 4, "forraje": 1 }, "secuenciaActual": ["papa", "arveja"] }
```

- El cuerpo puede ser `{}`: todas las prioridades valen 3 y la estrategia A repite el `cultivoActual` de la finca.
- `secuenciaActual` (1 a 4 claves) se repite en ciclo hasta completar 4 semestres.

---

## 🔬 Limitaciones conocidas

- **Los valores del catálogo y los pesos de los puntajes no están validados por un agrónomo.**
- La estrategia A, si no se envía `secuenciaActual`, **asume** monocultivo del cultivo actual.
- Cultivos de ciclo largo (maíz, tarwi en el segundo semestre) quedan fuera porque no caben en un semestre; el motor no modela cultivos que ocupen dos semestres.
- No usa pendiente, análisis de suelo, precios ni historial sanitario del lote (salen como vacíos de información).
- Las ventanas de siembra son las del inicio de lluvias; el calendario papero local puede diferir.
- En `riesgos` un mismo problema puede aparecer dos veces (como regla incumplida y como detalle del semestre).

## 🚫 Restricciones

- Los servicios de dominio son puros: sin `Date`, sin `fetch`, sin `throw` (Reglas 2 y 3).
- La firma de `CompararRotacionesUseCase.execute` y su constructor son contrato con `composition`, `api` y `mcp-server`.
- Los textos explicativos solo pueden usar datos calculados y `evidencia-reglas.ts`; no se inventan cifras.
