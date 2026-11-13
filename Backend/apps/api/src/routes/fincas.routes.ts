/**
 * Rutas de fincas (API abierta).
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { fincasController } from "../controllers/fincas.controller.ts";

export const fincasRoutes = new Hono<AppEnv>();

fincasRoutes.get("/", fincasController.listar);
fincasRoutes.post("/", fincasController.crear);
