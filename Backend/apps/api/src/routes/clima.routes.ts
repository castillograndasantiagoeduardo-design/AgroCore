/**
 * Rutas de clima (API abierta).
 *   GET /api/clima/fincas/:fincaId  → perfil climático (calendario de 12 meses) de una finca
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { limiteProveedoresExternos } from "../middlewares/proteccion.ts";
import { climaController } from "../controllers/clima.controller.ts";

export const climaRoutes = new Hono<AppEnv>();

climaRoutes.get("/fincas/:fincaId", limiteProveedoresExternos, climaController.perfilFinca);
