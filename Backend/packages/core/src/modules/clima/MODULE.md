# 📦 Módulo `clima`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.
> Este módulo se creó a mano (no con `add_module`) porque NO es un CRUD: no guarda entidades propias,
> consulta un proveedor externo y calcula un perfil.

---

## 🎯 Propósito

Construir el **perfil climático de cualquier ubicación** (punto o área): 12 meses con lluvia, temperaturas
**corregidas por la altitud del sitio**, probabilidad de helada, días de lluvia fuerte y temporada
(lluviosa/seca), a partir de 30 años de datos diarios de **NASA POWER**, **calibrados con las normales climatológicas 1991-2020 de la estación IDEAM más cercana** (en Duitama: Surbatá-Bonza [24035120], 2.485 m).

---

## 🧩 Dominio

| Elemento | Nombre | Descripción |
| :--- | :--- | :--- |
| Tipo | `RegistroClimaDiario` / `SerieClimatica` | Un día de datos (null = faltante) y la serie con la altitud de la celda del proveedor. |
| Servicio | `calcularAjusteTemperatura` | `(altitudCelda − altitudSitio) × 0,0065 °C/m`. |
| Servicio | `calcularCalendarioMensual` | Agrupa por mes-año, descarta meses con < 20 días válidos y promedia entre años. |
| Constantes | `UMBRAL_HELADA_C = 2`, `UMBRAL_LLUVIA_FUERTE_MM = 20`, `PROBABILIDAD_RIESGO_HELADA = 0.25` | Umbrales agronómicos (revisar con agrónomo local). |
| Puerto | `IClimaProvider` | `obtenerSerieDiaria({ latitud, longitud, desde, hasta })` → `Result<SerieClimatica>`. |
| Tipo | `NormalClimatologica` | Normal IDEAM de 30 años: 12 meses de lluvia, Tmín, Tmedia y Tmáx de una estación. |
| Servicio | `calcularFactoresCalibracion` | Compara NASA POWER en el punto de la estación (mismos años, llevada a su altitud) con la normal: `deltaT = IDEAM − NASA`, `factorLluvia = IDEAM ÷ NASA` (limitado a 0,2–5). |
| Servicio | `aplicarCalibracion` | Aplica el delta y el factor de cada mes a cada día de la serie del sitio. |
| Constante | `DISTANCIA_MAX_CALIBRACION_KM = 25` | Más lejos, la estación no representa el sitio y no se calibra. |
| Puerto | `INormalesClimatologicasProvider` | `estacionMasCercana(lat, lon)` → `Result<{ normal, distanciaKm }` o `null`. |
| Puerto | `IReloj` | `hoy()`; permite fijar la fecha en los tests. |

## ⚠️ Errores de Dominio

| Código | Clase | HTTP |
| :--- | :--- | :--- |
| `CLIMA_SIN_DATOS` | `ClimaSinDatosError` | 422 |
| `CLIMA_PROVEEDOR_NO_DISPONIBLE` | `ClimaProveedorNoDisponibleError` | 422 |

## ⚙️ Casos de Uso

| Caso de uso | Clave en `AppContainer` | Puertos inyectados | Audita |
| :--- | :--- | :--- | :--- |
| `ObtenerPerfilClimaticoUseCase` | `obtenerPerfilClimatico` | `IClimaProvider`, `INormalesClimatologicasProvider`, `IReloj` | ❌ (solo lectura) |

Periodo consultado: los **30 años completos** anteriores al año actual (normal climatológica).

Orden de cálculo: serie NASA del sitio → **calibración IDEAM** (si hay estación a ≤ 25 km) → **corrección por altitud** del sitio → calendario. Si el IDEAM no responde o no hay estación cerca, el perfil sale igual, con `calibracion: null` y una advertencia.

---

## 📁 Archivos por Capa

### 1. Contrato — Shared/contracts
- `Shared/contracts/src/clima.schema.ts` (`PerfilClimaticoUbicacionSchema`, `ClimaMensualSchema`, `PerfilClimaticoSchema`)
- `mcp-tools.ts` → `CLIMA_PERFIL_UBICACION`

### 2. Dominio — core/domain
- `domain/value-objects/registro-clima-diario.vo.ts`
- `domain/value-objects/normal-climatologica.vo.ts`
- `domain/services/calibracion.service.ts`
- `domain/services/correccion-altitud.service.ts`
- `domain/services/calendario-climatico.service.ts`
- `domain/errors/clima.errors.ts`

### 3. Aplicación — core/application
- `application/ports/index.ts` (`IClimaProvider`, `IReloj`)
- `application/use-cases/obtener-perfil-climatico.use-case.ts`
- `Backend/packages/core/tests/clima/obtener-perfil-climatico.use-case.test.ts`

### 4. Infraestructura — platform
- `Backend/packages/platform/src/nasa-power-client.ts` (API diaria de NASA POWER, comunidad AG, caché en memoria)
- `Backend/packages/platform/src/ideam-normales-client.ts` (datos.gov.co, dataset `nsz2-kzcq` "Normales Climatológicas de Colombia", caché en memoria)
- `Backend/packages/platform/src/sistema-reloj.ts`

### 5. Ensamblaje — composition
- `Backend/packages/composition/src/container.ts` → `obtenerPerfilClimatico`

### 6. Entrada — apps/api y apps/mcp-server
- `Backend/apps/api/src/controllers/clima.controller.ts`
- `Backend/apps/api/src/routes/clima.routes.ts` → `POST /api/clima/perfil` `{ latitud, longitud, altitudM? }`
- `Backend/apps/mcp-server/src/tools/clima.tools.ts` → tool `clima_perfil_ubicacion`
- `Http/clima.http`
- `Backend/scripts/probar-clima.ts` (prueba real sin MySQL)

### 7. Interfaz — Frontend
- Pendiente: calendario climático en la vista del área seleccionada.

---

## 🚫 Restricciones

- `core` no usa `fetch` ni `Date`: todo pasa por `IClimaProvider` e `IReloj` (Regla 2).
- `NasaPowerClient` no lanza excepciones al caso de uso: devuelve `Result.err(ClimaProveedorNoDisponibleError)`.
- Los valores `-999` de NASA POWER se convierten en `null` en el adaptador; el dominio nunca ve `-999`.

## 🔬 Resultado de la calibración en Duitama (sitio a 2.530 m, centro)

| | NASA POWER sin calibrar | Calibrado con Surbatá-Bonza | IDEAM medido |
| :--- | :--- | :--- | :--- |
| Lluvia anual | 1.599 mm | 880 mm | 895 mm |
| Tmín de enero | 9,2 °C | 5,3 °C | 5,6 °C |
| Meses con riesgo de helada | ninguno | enero, febrero | — |
| Temporadas lluviosas | 6 meses dispersos | mar–may y oct–nov (bimodal) | mar–may y oct–nov |

## 🔬 Limitaciones conocidas

- La calibración corrige **promedios mensuales**; NASA POWER varía menos de un día a otro que la realidad,
  así que las heladas de noches puntuales (hondonadas) pueden seguir subestimadas.
- Se supone que el error de la NASA es igual en la estación y en el sitio; para sitios altos (> 3.000 m)
  la estación del valle puede no representar bien la lluvia del páramo.
- La temporada "lluviosa/seca" usa el promedio mensual como corte; meses cercanos al corte pueden oscilar.
- La primera consulta tarda ~30–50 s (dos series de 30 años + IDEAM); las siguientes salen de la caché.

---

## 🌍 Clima global (Fase 4, AgroCore)

`ObtenerPerfilClimaticoUseCase` tiene dos entradas: `porUbicacion({ latitud, longitud, altitudM | null }, contexto)`
(cualquier punto del mundo; lo usan `rotaciones` y `recomendacion`) y `porUbicacionRapida(...)` (etapa rápida con climatología mensual si la serie diaria tarda).

| Servicio puro | Archivo | Qué calcula |
| :--- | :--- | :--- |
| ET0 Hargreaves–Samani | `evapotranspiracion.service.ts` | Ra por latitud y día (FAO-56 ec. 21) y ET0 mensual (FAO-56 ec. 52). Error típico ±10–15 %; en el trópico húmedo de montaña tiende a sobreestimar. |
| Calendario mensual | `calendario-climatico.service.ts` | + `diasCalorPromedio` (Tmáx ≥ 32 °C), `etoMm` y `balanceHidricoMm` (lluvia − ET0). |
| Clasificación | `clasificacion-climatica.service.ts` | tropical / subtropical / templado / frío / de altura (reemplaza valle-ladera-alta). |
| Resumen | `resumen-climatico.service.ts` | Índice de aridez (UNESCO), régimen de lluvias (unimodal, bimodal, uniforme, árido), meses de calor, déficit hídrico y lluvia extrema. |
| Temporadas de cultivo | `temporadas-cultivo.service.ts` | Mes apto = T media ≥ 5 °C, sin helada dura (mínima media ≤ 0 °C o ≥ 15 días de helada) y, en secano, lluvia ≥ 50 % de la ET0. Temporada = tramo circular de ≥ 3 meses aptos; ≥ 10 meses se dividen en dos. Soporta régimen bimodal, hemisferio sur y climas con invierno o verano seco. |
| Vulnerabilidad | `vulnerabilidad-climatica.service.ts` | Por mes: helada, calor, déficit hídrico y lluvia extrema con severidad baja / media / alta. |

Verificado con datos reales (NASA POWER, 30 años) el 2026-11-12:

| Lugar | Clasificación | Régimen | Temporadas de secano |
| :--- | :--- | :--- | :--- |
| Duitama (rural, calibrado IDEAM) | de altura | bimodal | mar–jun y sep–nov |
| Ames, Iowa | frío | unimodal | abr–oct (invierno fuera) |
| Nakuru, Kenia | de altura | bimodal | mar–jul y ago–dic |
| Córdoba, España | templado | unimodal | oct–mar (verano seco con déficit abr–sep) |

**IDEAM:** calibración opcional, solo Colombia (`IdeamNormalesClient` responde `null` sin consultar fuera de la caja de Colombia).
