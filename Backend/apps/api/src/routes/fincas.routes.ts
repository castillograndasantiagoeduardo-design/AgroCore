/**
 * Rutas de fincas: JWT + permiso RBAC por ruta.
 */
import { Hono } from "hono";
import { PERMISSIONS } from "@duitamacrece/contracts";
import type { AppEnv } from "../types.ts";
import { requireAuth, requirePermission } from "../middlewares/auth.ts";
import { fincasController } from "../controllers/fincas.controller.ts";

export const fincasRoutes = new Hono<AppEnv>();

fincasRoutes.use("*", requireAuth);
fincasRoutes.get("/", requirePermission(PERMISSIONS.FINCAS_LEER), fincasController.listar);
fincasRoutes.post("/", requirePermission(PERMISSIONS.FINCAS_CREAR), fincasController.crear);
