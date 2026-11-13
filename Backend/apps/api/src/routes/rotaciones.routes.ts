/**
 * Rutas de rotaciones (API abierta).
 *   POST /api/rotaciones/fincas/:fincaId/comparar  → compara estrategias de rotación de 2 años
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { limiteProveedoresExternos } from "../middlewares/proteccion.ts";
import { rotacionesController } from "../controllers/rotaciones.controller.ts";

export const rotacionesRoutes = new Hono<AppEnv>();

rotacionesRoutes.post("/fincas/:fincaId/comparar", limiteProveedoresExternos, rotacionesController.comparar);
