# 📦 Módulo `terreno`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.

---

## 🎯 Propósito

Analiza el **sitio** que el usuario seleccionó en el mapa (un punto o un polígono de hasta 100 ha, en cualquier lugar
del mundo) y devuelve un `PerfilTerreno` de **solo lectura**: si se puede sembrar ahí, relieve, suelo, humedad del
suelo, NDVI (meses baldíos y estrés de vegetación) y cobertura MODIS, con **fuentes** y **vacíos de información**.

> Si el punto o el área cae sobre una vía, la respuesta es **"No se puede sembrar: es carretera"** y el módulo
> `rotaciones` no calcula estrategias para esa parte.

---

## 🧩 Dominio (puro)

| Elemento | Archivo | Qué hace |
| :--- | :--- | :--- |
| `AreaSeleccionada` (VO compartido) | `core/src/shared/domain/geo/area-seleccionada.vo.ts` | Punto o polígono ≤ 100 ha, ≤ 100 vértices, sin lados cruzados. Centroide, hectáreas, caja y malla de muestreo. |
| Geometría | `core/src/shared/domain/geo/geometria.ts` | Distancia a polilínea, punto en polígono, área (proyección local). |
| `aptitud-terreno.service.ts` | `domain/services` | **Regla "es carretera"**: un punto está sobre una vía si su distancia al eje es menor que la mitad del ancho típico (`ANCHO_TIPICO_VIA_M`: motorway/trunk 12 m, primary 8, secondary 6, tertiary/residential 4, track 2, path/footway 1...). Para un área: malla de 12×12 puntos → % afectado por vías, edificaciones y agua, que se **excluye**; ≥ 90 % afectado ⇒ no apto. MODIS: agua → `no_apto_agua`; urbano, bosque, nieve → `no_apto_uso_suelo` (con aviso de que la celda es de 500 m). |
| `ndvi.service.ts` | `domain/services` | Climatología mensual del NDVI. **Mes baldío** = NDVI medio < 60 % del mes más verde y < 0,40 (si el lote nunca supera 0,25, no se marcan). **Estrés** = meses del último año ≥ 0,10 por debajo de lo normal. |
| `suelo-relieve.service.ts` | `domain/services` | Textura simplificada (arenosa / franca / arcillosa) y pendiente por diferencias centradas con 4 vecinos SRTM a 30 m. |

## 🔌 Puertos (`application/ports`) y adaptadores (`platform`)

| Puerto | Adaptador | Fuente |
| :--- | :--- | :--- |
| `IViasProvider` | `OverpassViasClient` | OpenStreetMap (Overpass API, 4 espejos, 3 rondas con backoff) |
| `ICoberturaProvider` | `OrnlModisClient` | NASA MODIS MCD12Q1 (IGBP, 500 m) vía ORNL DAAC |
| `INdviProvider` | `OrnlModisClient` | NASA MODIS MOD13Q1 NDVI (250 m, 16 días) vía ORNL DAAC, últimos 5 años |
| `ISueloProvider` | `SoilGridsClient` | ISRIC SoilGrids v2.0 (API pausada a ratos: tolera la caída) |
| `IElevacionProvider` | `OpenTopoDataElevacionClient` | NASA SRTM 30 m (vía OpenTopoData; respaldo ASTER) |
| `IHumedadSueloProvider` | `NasaPowerHumedadClient` | NASA POWER GWETTOP/GWETROOT/GWETPROF (climatología mensual) |
| `ICacheProveedores` (compartido) | `MySqlCacheProveedores` (`database`) | Tabla `cache_proveedores` (migración 005) |

Cada adaptador tiene timeout, reintento y caché en memoria + MySQL. **Un proveedor caído nunca produce un 500**: el
perfil sale igual con advertencia y vacío de información (`TerrenoProveedorNoDisponibleError` solo viaja entre el
adaptador y el caso de uso).

> Elevación: el plan proponía SRTM vía AppEEARS (asíncrono, minutos por petición). Se usa SRTM 30 m vía OpenTopoData
> (síncrono). AppEEARS queda como mejora para pendiente de alta resolución en todo el polígono.

## ⚙️ Casos de uso

| Caso de uso | Clave en `AppContainer` | Puertos | Audita |
| :--- | :--- | :--- | :--- |
| `AnalizarTerrenoUseCase` | `analizarTerreno` | los 6 proveedores + `IReloj` | ❌ (solo lectura) |

`analizar(area)` (método público) lo reutilizan `rotaciones` e `impresion` con un área ya validada.

## ⚠️ Errores

| Código | Dónde | HTTP |
| :--- | :--- | :--- |
| `AREA_INVALIDA`, `AREA_DEMASIADO_GRANDE` | `AreaSeleccionada` | 422 |
| `TERRENO_PROVEEDOR_NO_DISPONIBLE` | adaptadores → advertencia (nunca sale por HTTP) | — |

## 📁 Entradas

- `POST /api/terreno/analizar` con `{ area }` (`Shared/contracts/src/terreno.schema.ts`) · `Http/terreno.http`
- Tool MCP `terreno_analizar`
- `deno run -A scripts/probar-terreno.ts <lat> <lon>` (sin MySQL)
