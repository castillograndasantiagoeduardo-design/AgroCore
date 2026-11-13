/**
 * Rutas de terreno (API abierta).
 *   POST /api/terreno/analizar  → aptitud (carretera, edificación, agua, uso), suelo, relieve, NDVI y cobertura
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { limiteProveedoresExternos } from "../middlewares/proteccion.ts";
import { terrenoController } from "../controllers/terreno.controller.ts";

export const terrenoRoutes = new Hono<AppEnv>();

terrenoRoutes.post("/analizar", limiteProveedoresExternos, terrenoController.analizar);
