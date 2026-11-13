# ✅ Verificación final — AgroCore global (Fase 9)

> Ejecutada el 2026-11-13 sobre la rama `feat/agrocore-global` (commits locales `fase 0.5` … `fase 9`, sin push),
> con el árbol de trabajo que incluye los cambios de rendimiento hechos por el usuario después de la Fase 8
> (búsqueda IDEAM en paralelo, deduplicación de consultas, timeouts más cortos de proveedores y rediseño de `/explorar`).

## Resultado por condición

| # | Condición | Comando ejecutado | Resultado |
| :-- | :-- | :-- | :-- |
| 1 | Tipos y tests del backend | `deno task check` · `deno task test` (desde `Backend/`) | ✅ exit 0 · **121 pasados, 0 fallidos** |
| 2 | Frontend | `npx tsc --noEmit` · `npm run build` (desde `Frontend/`) | ✅ exit 0 · build OK (`/`, `/explorar`, `/fincas`, `/rotaciones`) |
| 3 | Sin rastro del nombre anterior ni de auth | `grep -rIi "duitamacrece\|duitama_crece\|DuitamaCrece"` (sin node_modules/.git) · `grep -rIi "requireAuth\|tienePermiso\|PERMISSIONS\|jwt"` en Backend/, Shared/, Frontend/src | ✅ ambos vacíos (exit 1) |
| 4 | Migraciones y arranque de la API | `deno run -A --env-file=../.env scripts/aplicar-migraciones.ts` · `deno task start` | ✅ exit 0 (7 migraciones registradas) · API arranca, `/api/health` saludable |
| 5 | E2E 5 lugares | `deno run -A --env-file=../.env scripts/smoke-e2e.ts` (API con el código actual en el puerto 8002) | ⚠️ **4/5 PASS**: Duitama (IDEAM calibrado), Iowa (temporada + invierno), Nakuru (bimodal) y Córdoba (déficit de verano), todos con 3–4 estrategias distintas completas. **Autopista: FAIL** por caída de OpenStreetMap/Overpass (ver abajo). |
| 6 | Frontend en desarrollo | `GET http://localhost:3000/explorar` con `npm run dev` | ✅ 200, 0 errores en `.next/dev/logs/next-development.log` |
| 7 | Impresión | `scripts/probar-impresora.ts` · `POST /api/impresion/terreno` | ✅ controlado: `IMPRESORA_NO_DISPONIBLE` (script: salida 2; API: HTTP 503) y la API sigue saludable. Vista previa: 52 líneas, máx. 32 caracteres. **Paso humano pendiente.** |

Auditoría del subagente `verificador`: las 7 Reglas de Oro sin violaciones (pureza de core, Result sin throw, todo en
composition, matriz de dependencias, Zod en todos los controladores y tools MCP, MODULE.md de cada módulo).

## Detalle del E2E (condición 5)

| Lugar | Coordenadas | Resultado |
| :-- | :-- | :-- |
| Duitama, lote rural | 5.785, −73.030 | PASS · NASA POWER calibrado con IDEAM · bimodal · A papa×4, B haba→centeno→papa→rábano, C remolacha↔arveja, D centeno↔vicia |
| Ames, Iowa | 42.008, −93.700 | PASS · temporada abr–oct + intervalo nov–mar · baldíos ene–abr, oct–dic (NDVI) · A maíz→barbecho, B caupí→barbecho→maíz, C maíz→barbecho→caupí |
| Nakuru, campo de Lanet | −0.270, 36.150 | PASS · bimodal (mar–jul, ago–dic) · baldíos feb–mar · 4 estrategias |
| Córdoba, Andalucía | 37.850, −4.850 | PASS · temporada oct–mar + intervalo seco · déficit abr–sep · 4 estrategias (D: centeno→vicia) |
| Autopista A-4 (Córdoba) | punto sobre el eje obtenido de Overpass | **FAIL** |

**Por qué falla la autopista:** en el primer intento el script obtuvo de Overpass un punto sobre la A-4
(37.892340, −4.739788), pero la consulta de la API a Overpass no respondió a tiempo. Como OSM no estaba disponible, el
terreno salió "apto" con la advertencia "no se verificaron vías", que es la degradación prevista y no un 500. En el
reintento, Overpass no respondió ni al propio script (4 espejos × 4 rondas). Una prueba manual de los espejos dio: solo
`maps.mail.ru` responde y tarda **~21 s**; los demás no responden en 30 s.

**Causa de fondo en el código actual:** el timeout de `OverpassViasClient` se bajó a **8 s con 1 ronda**
(`Backend/packages/platform/src/overpass-vias-client.ts`). Con los espejos así, la detección de carreteras queda en la
práctica deshabilitada: el sitio sale "apto" con advertencia. **Recomendación:** volver a `timeoutMs ≈ 30_000` y
`rondas = 2–3`. Solo afecta la primera consulta de cada sitio, porque el resultado queda en caché 30 días. Después,
repetir el E2E.

La regla "No se puede sembrar: es carretera" está cubierta por los tests de `core` (punto sobre la calzada →
`no_apto_carretera` con el mensaje exacto; `POST /api/rotaciones/comparar` → `TERRENO_NO_APTO` sin rotaciones). El sondeo
OSM de la coordenada literal del plan (5.8269, −73.0297) la ubicó a 0,7 m del eje de la Carrera 19. En el E2E, sin OSM,
ese punto salió `no_apto_uso_suelo` porque MODIS clasifica la celda como urbana.

## Pasos humanos pendientes

1. Compartir la Xprinter como `XP58`, encenderla con papel, imprimir la autoprueba (FEED + encender) y correr
   `scripts/probar-impresora.ts`; revisar tildes y ñ; ajustar `IMPRESORA_CODEPAGE` si hace falta.
2. Decidir el timeout de Overpass (ver arriba) y repetir el E2E cuando los espejos de Overpass respondan.
3. Borrar `Frontend/.env.local` si existía (token de la época del login).

## Variables nuevas para `.env` (opcionales; ver `.env.example`)

`FRONTEND_ORIGIN=http://localhost:3000` · `IMPRESORA_COMPARTIDA=XP58` · `IMPRESORA_CODEPAGE=2` · `IMPRESORA_CORTADOR=false`
