# Rendimiento de AgroCore

## Cómo se mide

- **API**: cada respuesta trae la cabecera `Server-Timing` con el desglose por proveedor (`power_sitio`, `power_estacion`,
  `ideam`, `modis_ndvi`, `modis_cobertura`, `overpass`, `soilgrids`, `srtm`, `power_humedad`, `mysql`, `motor`,
  `serializacion`, `total`) y la consola imprime una línea por petición:
  `[api] POST /api/terreno/analizar 200 6049ms · mysql=249 overpass=40 … soilgrids=6045`.
  En el navegador se ve en DevTools → Red → la petición → Tiempos.
- **Script**: `deno run -A --env-file=../.env scripts/medir-tiempos.ts [--solo=frio|caliente] [--salida=archivo.json]`
  mide los 5 lugares del E2E. **Frío** = contenedor nuevo sin caché en memoria ni caché MySQL (no borra nada);
  **caliente** = segunda consulta en el mismo contenedor. Primer resultado y completo se piden a la vez, como en el navegador.
- Implementación: puerto `IMedidorTiempos` (core, `shared/application/ports/medidor-tiempos.port.ts`),
  `MedidorTiemposAls` con `AsyncLocalStorage` (platform, `medicion/medidor-tiempos.ts`) y middleware
  `servidorTiempos` (api, `middlewares/tiempos.ts`).

## Línea base (2026-11-13, antes de la v2)

Flujo anterior: primer resultado = `/terreno/analizar`; completo = `/rotaciones/comparar`. Datos en
`Docs/mediciones/linea-base.json`.

| Lugar | Modo | Primer resultado | Completo | Proveedor más lento |
| :-- | :-- | --: | --: | :-- |
| Duitama (lote rural) | frío | 63,04 s | 66,41 s | modis_cobertura 63,03 s |
| Duitama (lote rural) | caliente | 6,01 s | 6,09 s | soilgrids 6,01 s |
| Ames, Iowa | frío | 63,05 s | 65,01 s | modis_cobertura 63,05 s |
| Ames, Iowa | caliente | 6,01 s | 6,02 s | soilgrids 6,01 s |
| Nakuru, Kenia | frío | 63,06 s | 64,78 s | modis_cobertura 63,06 s |
| Nakuru, Kenia | caliente | 23,76 s | 23,80 s | overpass 23,76 s |
| Córdoba, Andalucía | frío | 187,84 s | 189,43 s | modis_ndvi 187,84 s |
| Córdoba, Andalucía | caliente | 31,59 s | 31,59 s | overpass 31,59 s |
| Autopista A-4 | frío | 53,44 s | 54,82 s | modis_ndvi 53,44 s |
| Autopista A-4 | caliente | 39,06 s | 39,06 s | overpass 39,05 s |

Desglose en frío (Duitama): `modis_cobertura=63033 modis_ndvi=63033 overpass=25440 soilgrids=6012 power_sitio=1748
ideam=1429 power_estacion=1375 srtm=786 power_humedad=786 motor=213` (ms).

## Los 3 cuellos de botella (causa demostrada)

1. **MODIS en ORNL (53–188 s en frío).** `modis_cobertura` termina exactamente al mismo tiempo que `modis_ndvi`
   (63 033 ms = 63 033 ms): la cobertura, que la aptitud necesita, espera en la misma cola de concurrencia que los
   bloques de 5 años de NDVI (`OrnlModisClient`, concurrencia 6, timeout 20 s, 2 reintentos). Además, el primer
   resultado espera a **todos** los proveedores (`Promise.all` en `AnalizarTerrenoUseCase`).
2. **Overpass (25–39 s, también en caliente).** En Nakuru, Córdoba y la autopista, Overpass falla y **el fallo no se
   guarda en caché**: cada consulta vuelve a esperar 24–39 s (4 espejos), aunque el sitio ya se consultó.
3. **SoilGrids (6 s en cada consulta, también en caliente).** El servicio está caído: cada consulta espera su timeout
   de 6 s (`soilgrids=6009` en todas las mediciones calientes) y el fallo tampoco se recuerda.

NASA POWER **no** es un cuello de botella hoy: la serie diaria de 30 años tarda 1,4–1,9 s (`power_sitio`), y el motor
de rotaciones tarda 4–213 ms.

## Bloqueos (fase 2.7)

Se completa en la fase 2.7 con la reproducción de clics seguidos, cambio de punto durante la carga y proveedor lento.
