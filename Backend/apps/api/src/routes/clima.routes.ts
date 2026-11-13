/**
 * Rutas de clima (API abierta).
 *   POST /api/clima/perfil  → perfil climático (calendario de 12 meses) de cualquier ubicación
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { limiteProveedoresExternos } from "../middlewares/proteccion.ts";
import { climaController } from "../controllers/clima.controller.ts";

export const climaRoutes = new Hono<AppEnv>();

climaRoutes.post("/perfil", limiteProveedoresExternos, climaController.perfilUbicacion);
