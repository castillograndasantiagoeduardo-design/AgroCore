/**
 * Rutas de clima: JWT + permiso RBAC por ruta.
 *   GET /api/clima/fincas/:fincaId  → perfil climático (calendario de 12 meses) de una finca
 */
import { Hono } from "hono";
import { PERMISSIONS } from "@duitamacrece/contracts";
import type { AppEnv } from "../types.ts";
import { requireAuth, requirePermission } from "../middlewares/auth.ts";
import { climaController } from "../controllers/clima.controller.ts";

export const climaRoutes = new Hono<AppEnv>();

climaRoutes.use("*", requireAuth);
climaRoutes.get("/fincas/:fincaId", requirePermission(PERMISSIONS.CLIMA_LEER), climaController.perfilFinca);
