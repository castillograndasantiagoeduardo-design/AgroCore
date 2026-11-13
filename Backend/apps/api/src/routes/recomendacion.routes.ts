/**
 * Rutas de la recomendación por época (API abierta).
 *   POST /api/recomendacion/rapida   etapa rápida (aptitud, clima resumido, épocas y qué sembrar para los 4 objetivos)
 *   POST /api/recomendacion/detalle  suelo, vegetación, clima mes a mes y 3+ estrategias de rotación
 *   POST /api/recomendacion/flujo    las dos etapas en NDJSON con el avance de cada fuente (pantalla de carga)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { limitePeticiones } from "../middlewares/proteccion.ts";
import { recomendacionController } from "../controllers/recomendacion.controller.ts";

/** Más holgado que el límite general: la interfaz precarga la celda bajo el cursor. */
const limiteRecomendacion = limitePeticiones({ maximo: 90, ventanaMs: 60_000 });

export const recomendacionRoutes = new Hono<AppEnv>();
recomendacionRoutes.post("/rapida", limiteRecomendacion, recomendacionController.rapida);
recomendacionRoutes.post("/detalle", limiteRecomendacion, recomendacionController.detalle);
recomendacionRoutes.post("/flujo", limiteRecomendacion, recomendacionController.flujo);
