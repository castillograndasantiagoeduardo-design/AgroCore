# 📈 Progreso de Duitama Crece

> Documento de traspaso entre sesiones de trabajo con IA. Léelo junto con `CLAUDE.md` antes de continuar.
> Última actualización: 2026-11-12.

## 🎯 Qué es el proyecto

Herramienta de apoyo para **rotación de cultivos en Duitama (Boyacá, Colombia)** para el reto NASA Space Apps.
Combina datos de la NASA (POWER, SRTM, MODIS/HLS NDVI, SMAP, GPM) con datos locales (IDEAM, IGAC, UPRA)
para comparar **3 estrategias de rotación** (actual + 2 alternativas) con evidencia, beneficios, vacíos y riesgos.
**Sugiere y explica; no reemplaza el criterio del agricultor ni del agrónomo.**

## 👤 Cómo prefiere trabajar el usuario

- Todo en **español**, **paso a paso**, con explicaciones **muy específicas**: ruta exacta de cada archivo,
  qué hace cada parte, resultado esperado y qué hacer si falla.
- Stack **TypeScript + Deno** (nada de Python), arquitectura generada con su scaffolder `MCP_SCAFOLD_AL`.
- Trabaja en la terminal de su IDE (Antigravity) en Windows / PowerShell.
- MySQL 8 local (servicio `MySQL80`). Nunca pedir ni repetir contraseñas; van solo en `.env`.

## ✅ Hecho

| Paso | Qué | Dónde |
| :--- | :--- | :--- |
| 1 | Monorepo generado (scope `@duitamacrece`, módulo inicial `fincas`) | todo el repo |
| 2A | `fincas` con `latitud`, `longitud`, `altitudM`, `vereda`, `tieneRiego`, `cultivoActual`; VO `UbicacionFinca` valida área de Duitama (2.300–4.000 m) y deriva zona `valle` (<2.600) / `ladera` (2.600–2.999) / `alta` (≥3.000) | `core/src/modules/fincas` |
| 2B | Módulo `clima`: NASA POWER diario 30 años, corrección por altitud (0,0065 °C/m), calendario de 12 meses (helada = Tmín ≤ 2 °C, lluvia fuerte ≥ 20 mm) | `core/src/modules/clima`, `platform/src/nasa-power-client.ts` |
| 2C | Calibración con **normales IDEAM 1991-2020** (datos.gov.co `nsz2-kzcq`), estación más cercana ≤ 25 km (Surbatá-Bonza 24035120). Resultado: lluvia 1.599 → 880 mm (IDEAM 895), aparecen heladas ene–feb | `calibracion.service.ts`, `platform/src/ideam-normales-client.ts` |
| 3 | Módulo `cultivos`: catálogo de 11 cultivos (solo lectura, versionado en código, sin tabla MySQL) con entidad `Cultivo`, VO `Rango`, `aptitudPorAltitud`, `compartenFamilia` y servicio `filtrarCultivos` (reutilizable por rotaciones) | `core/src/modules/cultivos`, `database/src/catalogos` |
| 4 | `Finca.cultivoActual` guarda la **clave del catálogo** (Zod valida la forma; `CrearFincaUseCase` valida que exista → `FINCA_CULTIVO_DESCONOCIDO`) | `fincas.schema.ts`, `crear-finca.use-case.ts`, `Docs/migraciones/002_fincas_cultivo_actual_clave.sql` |
| 5 | Motor `rotaciones`: compara 3 estrategias de 2 años (A actual, B suelo con cultivos de ciclo corto, C forraje) con 7 reglas, puntajes por prioridad, evidencia, vacíos y riesgos. API + MCP + Frontend (`/rotaciones`) | `core/src/modules/rotaciones`, `apps/api`, `apps/mcp-server`, `Frontend/src/features/rotaciones` |

- Endpoints: `GET /api/clima/fincas/:fincaId`, `GET /api/cultivos[?altitudM=&familia=&uso=&fijaNitrogeno=&toleranciaHeladaMin=]`, `GET /api/cultivos/:clave`, `POST /api/rotaciones/fincas/:fincaId/comparar`.
- Tools MCP: `clima_perfil_finca`, `cultivos_listar`, `cultivos_obtener`, `rotaciones_comparar`.
- Pruebas sin MySQL (desde `Backend/`): `deno run -A scripts/probar-clima.ts 2530` · `deno run -A scripts/probar-cultivos.ts 3300` · `deno run -A scripts/probar-rotaciones.ts 2530 papa`.
- Verificación: `deno task check` OK y `deno task test` **76/76**. Frontend: `npx tsc --noEmit` sin errores y `npm run dev` sirve `/fincas` y `/rotaciones` (hubo que fijar `turbopack.root` al monorepo en `next.config.ts` para que resuelva `Shared/contracts`).
- Detalle técnico y limitaciones: `MODULE.md` de `clima`, `cultivos` y `rotaciones`.
- Resultado de referencia (finca a 2.530 m, papa, sin riego): A papa×4 = 30 · B arveja → cebada → papa → avena+vicia = 67 · C pradera raigrás+trébol = 76.
- ⚠️ Los valores del catálogo, los pesos de los puntajes y la tabla de ingreso son de referencia: **validar con agrónomo local**.
- ⚠️ Evidencia (investigación 2026-11-12): el ICA documenta rotar la papa y eliminar toyas, pero **ninguna fuente fija cuántos semestres sin papa** ni la frecuencia de leguminosas; el motor las presenta como práctica recomendada (`evidencia-reglas.ts`).

## 🤖 Subagentes (`.claude/agents`)

- `investigador-cultivos` (sonnet), `implementador-capa` (sonnet), `verificador` (haiku).
- Se cargan **al iniciar** Claude Code: si se crean o editan en mitad de una sesión hay que reiniciarla para usarlos por nombre.
- Forma de trabajo que funcionó: el agente principal escribe contrato, puertos, firma del caso de uso y `container.ts` (con un esqueleto que compile); luego 3 implementadores en paralelo con listas de archivos sin cruces; al final documentación y verificador.

## ⏳ Pendiente inmediato (del usuario)

- [ ] **BLOQUEANTE:** aplicar `Docs/migraciones/001_fincas_ubicacion.sql` y después `002_fincas_cultivo_actual_clave.sql` (en ese orden). Verificado el 2026-11-12: `fincas` está vacía y solo tiene `id, nombre, descripcion, activo, creado_en`; sin esto `/api/fincas` y `/api/rotaciones` responden 500.
- [ ] `.env`: dejar un solo `JWT_SECRET` y usar el usuario `duitama_app` en vez de `root` (cambiar la clave de root).
- [ ] No hay login todavía. Atajo SOLO de desarrollo: `cd Backend && deno run -A --env-file=../.env scripts/emitir-token.ts --frontend` emite un JWT admin de 8 h (lo imprime para los `.http` y lo guarda en `Frontend/.env.local`, que `http-client.ts` lee fuera de producción). Quitar ambos cuando exista login.
- [ ] Frontend: `npm audit` reporta 1 vulnerabilidad alta en una dependencia (sin revisar). Falta un enlace a `/rotaciones` en el layout del panel y probar con `npm run dev`.

## 🗺️ Siguientes pasos del plan

1. ~~Módulo `cultivos`~~ ✅ (paso 3).
2. ~~Motor `rotaciones`~~ ✅ (pasos 4 y 5). Mejoras pendientes: cultivos que ocupen dos semestres (maíz, tarwi),
   regla de cobertura en pendiente > 25 % (necesita SRTM), revisar pesos con agrónomo.
3. **Login y emisión de JWT** (SIGUIENTE sugerido: sin él no se puede probar la API ni el Frontend de extremo a extremo).
4. Altitud y pendiente automáticas con **SRTM** y NDVI (MODIS/HLS) vía **AppEEARS** (cuenta Earthdata ya creada).
5. Fichas explicativas con IA (solo con datos calculados) y frontend con mapa de Duitama.
6. Caché persistente del clima en MySQL (la primera consulta tarda ~45 s).
