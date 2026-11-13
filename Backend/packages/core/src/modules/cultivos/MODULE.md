# 📦 Módulo `cultivos`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.

---

## 🎯 Propósito

Catálogo **global** de referencia de **50 cultivos** (solo lectura, versionado en código, sin tabla MySQL):
cereales, pseudocereales, leguminosas, tubérculos, hortalizas, oleaginosas, industriales, forrajes y coberturas /
abonos verdes, para climas fríos, templados, tropicales y áridos. Lo usa el motor de rotaciones como primer filtro.

> **Origen de los datos:** el catálogo lo **genera** `Backend/scripts/fuentes/generar-catalogo.ts` a partir de **FAO ECOCROP**
> (`Docs/fuentes/ecocrop_registros.tsv`, por EcoPortCode) y **FAOSTAT** (valor bruto de la producción por ha). **No se edita
> a mano** (`database/src/catalogos/catalogo-cultivos.datos.ts`). La facelia (*Phacelia tanacetifolia*) quedó fuera por no
> estar en ECOCROP (`CULTIVOS_SIN_FUENTE`). Cada ficha trae `ecocrop.codigos`, la fuente de cada valor (`fuentesValores`) y la
> lista de campos que ECOCROP no trae (`camposSinFuente`): **esos campos llevan un valor de relleno que NO debe usarse para
> decidir** (`sinFuente(campo)`; getters `toleranciaHeladaConocida()`, `valorForrajeroConocido()`, `coberturaConocida()`).

## 🧮 Derivación de los valores desde ECOCROP (umbrales del generador)

| Campo | Regla |
| :--- | :--- |
| `temperaturaOptimaC` / `temperaturaAbsolutaC` | `[TOPMN, TOPMX]` / `[TMIN, TMAX]` (óptima ⊂ absoluta). |
| `lluviaAnualOptimaMm` / `aguaCicloMm` | `[ROPMN, ROPMX]` / `[RMIN, ROPMN]` (modelo EcoCrop: la lluvia se evalúa en la temporada de cultivo). |
| `phOptimo` / `cicloDias` | `[PHOPMN, PHOPMX]` / `[GMIN, GMAX]`. |
| `toleranciaHelada` | Temperatura letal `min(KTMP, KTMPR)`: ≤ −5 °C alta · ≤ −2 °C media · > −2 °C baja · sin dato → **sin fuente**. |
| `toleranciaCalor` | Por `TMAX`: ≥ 40 °C alta · ≥ 35 °C media · < 35 °C baja. |
| `necesidadAgua` | Por `ROPMN`: ≤ 500 mm baja · ≤ 900 mm media · > 900 mm alta. |
| `toleranciaSequia` | Por `RMIN`: ≤ 300 mm alta · ≤ 500 mm media · > 500 mm baja. |
| `texturas` | `TEXT`: heavy → arcillosa, medium → franca, light → arenosa, wide → las tres; sin dato → sin fuente. |
| `profundidadRaiz` | `DEP` (profundidad de suelo que requiere): shallow → superficial, medium → media, deep → profunda. |
| `valorForrajero` | `CAT` incluye «forage/pasture» → alto; si no → ninguno; `CAT` vacío → sin fuente. |
| `coberturaSuelo` | `CAT` incluye «cover crop» → alta; si no → baja; `CAT` vacío → sin fuente. |
| `familias` / `fijaNitrogeno` | `FAMNAME` (Leguminosae → fabáceas, que fijan nitrógeno). |
| `valorProduccionHa` | `DatoConFuente` de FAOSTAT (mundo, I$/ha); sin dato → `valor: null` y el campo queda en `camposSinFuente`. |
| Asociaciones (dos registros) | Intersección de los rangos y el valor **menos tolerante**. |

> Los umbrales numéricos viven en el generador (única fuente de verdad); si cambian allí, se regenera el catálogo y se actualiza esta tabla.

## 🧩 Dominio

| Elemento | Descripción |
| :--- | :--- |
| Entidad `Cultivo` | clave, nombre, familias, uso (alimento / forraje / doble propósito / cobertura), grupo, perenne, `cicloDias`, `ocupaVariasTemporadas`, `temperaturaOptimaC` y `temperaturaAbsolutaC` (media del ciclo), `lluviaAnualOptimaMm`, `aguaCicloMm`, tolerancias a helada / calor / sequía, `phOptimo`, `texturas`, `profundidadRaiz`, `fijaNitrogeno`, `coberturaSuelo`, `valorForrajero`, notas, fuentes, `ecocrop`, `fuentesValores`, `camposSinFuente` y `valorProduccionHa`. (Ya no hay `plagasClave` ni `confianza`: ninguna de las dos tenía fuente.) |
| Invariantes | óptima ⊂ absoluta; pH 3–10; ≥ 1 familia, textura y fuente; solo fabáceas fijan N. |
| Métodos | `aptitudPorTemperatura(t)` (óptima / posible / no apta), `phCompatible`, `texturaCompatible` (null si no hay textura del suelo **o la del cultivo no tiene fuente**), `compartenFamilia`, `mesesCicloMedio`, `esCobertura`, `sinFuente`, `fuenteDe`, `sinDatosDeViabilidad`. |
| `filtrarCultivos` | Por temperatura media, lluvia anual, pH, textura, familia, uso, grupo, fijación de N y tolerancia a helada. Un cultivo con temperatura o ciclo sin fuente nunca es apto; sin temperatura letal (helada sin fuente) no cumple `toleranciaHeladaMin`. |
| Puerto `ICultivoRepository` | `CatalogoCultivosEnMemoria` (`database/src/catalogos`, valida todo al arrancar: Fail-Fast). |

## ⚙️ Casos de uso

| Caso de uso | Clave en `AppContainer` | Audita |
| :--- | :--- | :--- |
| `ListarCultivosUseCase` | `listarCultivos` | ❌ (solo lectura) |
| `ObtenerCultivoUseCase` | `obtenerCultivo` | ❌ (solo lectura) |

## ⚠️ Errores

| Código | HTTP |
| :--- | :--- |
| `CULTIVO_NO_ENCONTRADO` | 404 |
| `CULTIVO_DATOS_INVALIDOS` (catálogo mal cargado: la API no arranca) | — |

## 📁 Entradas

- `GET /api/cultivos?tempMediaC=&lluviaAnualMm=&ph=&textura=&familia=&uso=&grupo=&fijaNitrogeno=&toleranciaHeladaMin=` · `GET /api/cultivos/:clave`
- Tools MCP `cultivos_listar`, `cultivos_obtener` · `Http/cultivos.http`
- `deno run -A scripts/probar-cultivos.ts <tempMediaC> [lluviaAnualMm] [ph]`
