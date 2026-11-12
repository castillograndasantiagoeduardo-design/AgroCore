/**
 * Rutas de cultivos: JWT + permiso RBAC por ruta.
 *   GET /api/cultivos          → catálogo (filtros: altitudM, familia, uso, fijaNitrogeno, toleranciaHeladaMin)
 *   GET /api/cultivos/:clave   → ficha completa de un cultivo
 */
import { Hono } from "hono";
import { PERMISSIONS } from "@duitamacrece/contracts";
import type { AppEnv } from "../types.ts";
import { requireAuth, requirePermission } from "../middlewares/auth.ts";
import { cultivosController } from "../controllers/cultivos.controller.ts";

export const cultivosRoutes = new Hono<AppEnv>();

cultivosRoutes.use("*", requireAuth);
cultivosRoutes.get("/", requirePermission(PERMISSIONS.CULTIVOS_LEER), cultivosController.listar);
cultivosRoutes.get("/:clave", requirePermission(PERMISSIONS.CULTIVOS_LEER), cultivosController.obtener);
