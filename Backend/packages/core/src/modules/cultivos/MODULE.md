# 📦 Módulo `cultivos`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.

---

## 🎯 Propósito

Catálogo **global** de referencia de **51 cultivos** (solo lectura, versionado en código, sin tabla MySQL):
cereales, pseudocereales, leguminosas, tubérculos, hortalizas, oleaginosas, industriales, forrajes y coberturas /
abonos verdes, para climas fríos, templados, tropicales y áridos. Lo usa el motor de rotaciones como primer filtro.

> ⚠️ Los valores son de **referencia** (estilo FAO ECOCROP + literatura). En la sesión del 2026-11-12 los
> investigadores **no pudieron verificar las fuentes en línea**: ninguna ficha tiene confianza "alta" y todas llevan
> `AVISO_VERIFICACION`. Contrastar con https://ecocrop.apps.fao.org y validar con agrónomo local.

## 🧩 Dominio

| Elemento | Descripción |
| :--- | :--- |
| Entidad `Cultivo` | clave, nombre, familias, uso (alimento / forraje / doble propósito / cobertura), grupo, perenne, `cicloDias`, `ocupaVariasTemporadas`, `temperaturaOptimaC` y `temperaturaAbsolutaC` (media del ciclo), `lluviaAnualOptimaMm`, `aguaCicloMm`, tolerancias a helada / calor / sequía, `phOptimo`, `texturas`, `profundidadRaiz`, `fijaNitrogeno`, `coberturaSuelo`, `valorForrajero`, `plagasClave`, notas, fuentes y `confianza`. |
| Invariantes | óptima ⊂ absoluta; pH 3–10; ≥ 1 familia, textura y fuente; solo fabáceas fijan N. |
| Métodos | `aptitudPorTemperatura(t)` (óptima / posible / no apta), `phCompatible`, `texturaCompatible`, `compartenFamilia`, `mesesCicloMedio`, `esCobertura`. |
| `filtrarCultivos` | Por temperatura media, lluvia anual, pH, textura, familia, uso, grupo, fijación de N y tolerancia a helada. |
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
