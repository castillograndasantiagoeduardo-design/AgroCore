# 📈 Progreso de AgroCore

> Documento de traspaso entre sesiones de trabajo con IA. Léelo junto con `CLAUDE.md` antes de continuar.
> Última actualización: 2026-11-12 (ejecución completa de `Docs/PLAN_AGROCORE_GLOBAL.md`, rama `feat/agrocore-global`).

## 🎯 Qué es el proyecto

Herramienta de apoyo a la **rotación de cultivos en cualquier lugar del mundo** (nació como reto NASA Space Apps para
Duitama, Boyacá). Se selecciona un punto o un área (≤ 100 ha) y combina NASA POWER, MODIS (ORNL), SRTM (OpenTopoData),
SoilGrids, OpenStreetMap e IDEAM (Colombia) para dar aptitud del sitio, terreno, clima, cultivos aptos, calendario
(baldío / vulnerable / oportunidad) y **3–4 estrategias de rotación de 2 años** con evidencia, beneficios, vacíos y riesgos.
**Sugiere y explica; no reemplaza el criterio del agricultor ni del agrónomo.**

## 👤 Cómo prefiere trabajar el usuario

- Todo en **español**, con explicaciones **muy específicas**: ruta exacta de cada archivo, qué hace, resultado esperado y qué hacer si falla.
- Stack **TypeScript + Deno** (nada de Python), arquitectura de su scaffolder `MCP_SCAFOLD_AL`.
- Windows / PowerShell, IDE Antigravity. MySQL 8 local (en este equipo el servicio se llama `MySQL267`).
- Nunca pedir, mostrar ni editar valores de `.env`; los scripts los leen con `--env-file=../.env`.

## ✅ Hecho — plan AgroCore global (2026-11-12)

| Fase | Commit | Qué |
| :--- | :--- | :--- |
| 0 | — | Rama `feat/agrocore-global`; línea base `check` OK y **83/83** tests. |
| 0.5 | `fase 0.5` | Sin login, JWT ni roles. `ContextoSolicitud { origen: api/mcp/script, ip }`; auditoría por `origen` (migración `003b`). CORS al Frontend, límite por IP y tamaño de body. |
| 1 | `fase 1` | Renombre a **AgroCore** (`@agrocore/*`, base `agrocore`, MCP `agrocore-mcp-server`), lockfiles regenerados. |
| 2 | `fase 2` | Ubicación global: VO `AreaSeleccionada` (punto o polígono ≤ 100 ha, ≤ 100 vértices, sin cruces), altitud −500..6000, `localidad/pais/region/area`, clasificación climática derivada. Migración `004`. `scripts/aplicar-migraciones.ts` (idempotente). Mapa mundial con punto, área y buscador Nominatim. |
| 3 | `fase 3` | Módulo **`terreno`**: regla "es carretera" en el dominio (semiancho por tipo de vía), edificación, agua, MODIS; SRTM y pendiente; SoilGrids (tolera la caída); NDVI MODIS (baldíos y estrés); humedad POWER. Caché MySQL `cache_proveedores` (migración `005`). `POST /api/terreno/analizar`, tool `terreno_analizar`. |
| 4 | `fase 4` | Clima global: ET0 Hargreaves, balance hídrico, días de calor, régimen de lluvias, **temporadas derivadas**, calendario de vulnerabilidad. IDEAM solo en Colombia. |
| 5 | `fase 5` | Catálogo **global de 51 cultivos** (temperaturas ECOCROP, tolerancias, pH, textura, raíz, plagas, confianza). |
| 6 | `fase 6` | Motor generalizado: ventanas en temporadas reales (temporada + intervalo/barbecho), siembra flexible dentro de la ventana, cultivos de dos temporadas, 12 reglas, estrategias **A/B/C/D distintas**, evidencia con fuente, calendario y oportunidades. `POST /api/rotaciones/comparar`. |
| 7 | `fase 7` | Frontend **`/explorar`**: mapa + formulario con presets, carga progresiva, banner de aptitud, ficha de terreno, calendario, tabla y tarjetas de estrategias, oportunidades, fuentes, guardar finca. |
| 8 | `fase 8` | Impresión térmica: módulo `impresion` (ticket de 32 caracteres), `EscPosWindowsPrinter` (CP850, `copy /b` a `\\localhost\XP58`), `POST /api/impresion/terreno`, respaldo `window.print()`. |
| 9 | `fase 9` | Verificación final: ver `Docs/VERIFICACION_FINAL.md`. |

## 📌 Decisiones y hallazgos importantes

- **Coordenada del plan para Duitama (5.8269, −73.0297):** está en el casco urbano, a 0,7 m del eje de la Carrera 19; la
  app responde correctamente "No se puede sembrar: es carretera". El E2E usa un **lote rural de Duitama (5.785, −73.030)**
  (MODIS 10 pastizal, sin vías cerca) como caso "apto".
- **Coordenada del plan para Nakuru (−0.3031, 36.0800):** es el centro urbano (MODIS 13). El E2E usa un **campo en
  Lanet, Nakuru (−0.270, 36.150)** (MODIS 12 tierras de cultivo).
- **Elevación:** SRTM 30 m vía OpenTopoData (síncrono) en lugar de AppEEARS (asíncrono, minutos por consulta). AppEEARS queda como mejora.
- **Helada en temporadas:** solo la helada dura (mínima media ≤ 0 °C o ≥ 15 días/mes) cierra una temporada; las leves las
  evalúa el motor con la tolerancia de cada cultivo (si no, el invierno mediterráneo quedaba sin trigo de secano).
- **Overpass (OSM):** los espejos públicos fallan a ratos (502/504/timeout); el adaptador prueba 4 espejos en 3 rondas y la
  caché MySQL guarda los aciertos 30 días. Si falla, el terreno sale "apto" con advertencia de que no se verificaron vías.
- **Catálogo:** los investigadores **no pudieron verificar las fuentes en línea**; ninguna ficha tiene confianza "alta" y todas
  llevan el aviso de verificación (contrastar con FAO ECOCROP y validar con agrónomo local).

## ⏳ Pendiente (del usuario)

- [ ] **Impresora:** compartir la Xprinter en Windows como `XP58`, encenderla con papel, imprimir la autoprueba (FEED +
      encender) y correr `deno run -A --env-file=../.env scripts/probar-impresora.ts`; revisar con los ojos tildes y ñ;
      si salen mal, ajustar `IMPRESORA_CODEPAGE`.
- [ ] **`.env`:** agregar (opcionales) `FRONTEND_ORIGIN`, `IMPRESORA_COMPARTIDA`, `IMPRESORA_CODEPAGE`, `IMPRESORA_CORTADOR`
      (ver `.env.example`). Usar un usuario de aplicación de MySQL en vez de `root`.
- [ ] Si existía `Frontend/.env.local` con un token de la época del login, bórralo (ya no se usa).
- [ ] Validar con un agrónomo local los rangos del catálogo, los pesos de los puntajes y la referencia de ingreso.
- [ ] Revisar `npm audit` del Frontend (1 vulnerabilidad alta reportada antes, sin revisar).
- [ ] **Overpass:** el timeout se bajó a 8 s / 1 ronda; con los espejos públicos lentos (~21 s) la detección de carreteras no alcanza a responder. Recomendado 30 s y 2–3 rondas; luego repetir `scripts/smoke-e2e.ts` (4/5 PASS el 2026-11-13, falla solo la autopista por Overpass). Ver `Docs/VERIFICACION_FINAL.md`.

## 🗺️ Siguientes pasos sugeridos

1. Pendiente por área completa con SRTM (AppEEARS o más puntos de OpenTopoData).
2. SMAP / GPM IMERG / ECOSTRESS / GRACE (tendencia hídrica y estrés térmico de alta resolución).
3. Precios y costos locales para que el puntaje de ingreso deje de ser cualitativo.
4. QR en el ticket con el enlace al análisis.
5. Antes de publicar en internet: autenticación o al menos una clave de API y límites más estrictos.
