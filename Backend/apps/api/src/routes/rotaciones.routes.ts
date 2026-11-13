/**
 * Rutas de rotaciones (API abierta).
 *   POST /api/rotaciones/comparar                  → cualquier punto o área del mundo
 * Si el sitio no es apto (ej. "No se puede sembrar: es carretera") responde 422 TERRENO_NO_APTO.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { limiteProveedoresExternos } from "../middlewares/proteccion.ts";
import { rotacionesController } from "../controllers/rotaciones.controller.ts";

export const rotacionesRoutes = new Hono<AppEnv>();

rotacionesRoutes.post("/comparar", limiteProveedoresExternos, rotacionesController.compararUbicacion);
