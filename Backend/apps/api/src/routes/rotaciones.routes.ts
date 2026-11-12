/**
 * Rutas de rotaciones: JWT + permiso RBAC por ruta.
 *   POST /api/rotaciones/fincas/:fincaId/comparar  → compara 3 estrategias de rotación de 2 años
 */
import { Hono } from "hono";
import { PERMISSIONS } from "@duitamacrece/contracts";
import type { AppEnv } from "../types.ts";
import { requireAuth, requirePermission } from "../middlewares/auth.ts";
import { rotacionesController } from "../controllers/rotaciones.controller.ts";

export const rotacionesRoutes = new Hono<AppEnv>();

rotacionesRoutes.use("*", requireAuth);
rotacionesRoutes.post(
  "/fincas/:fincaId/comparar",
  requirePermission(PERMISSIONS.ROTACIONES_COMPARAR),
  rotacionesController.comparar,
);
