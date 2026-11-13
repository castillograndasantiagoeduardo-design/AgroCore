/**
 * Rutas de cultivos (API abierta, solo lectura).
 *   GET /api/cultivos          → catálogo con filtros opcionales
 *   GET /api/cultivos/:clave   → ficha completa de un cultivo
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { cultivosController } from "../controllers/cultivos.controller.ts";

export const cultivosRoutes = new Hono<AppEnv>();

cultivosRoutes.get("/", cultivosController.listar);
cultivosRoutes.get("/:clave", cultivosController.obtener);
