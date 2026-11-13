/**
 * Rutas de impresión (API abierta).
 *   POST /api/impresion/terreno  → ticket térmico (58 mm) con el resumen del terreno; soloVistaPrevia=true no imprime
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { limiteProveedoresExternos } from "../middlewares/proteccion.ts";
import { impresionController } from "../controllers/impresion.controller.ts";

export const impresionRoutes = new Hono<AppEnv>();

impresionRoutes.post("/terreno", limiteProveedoresExternos, impresionController.terreno);
