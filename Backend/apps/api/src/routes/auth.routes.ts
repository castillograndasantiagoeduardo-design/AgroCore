/**
 * Rutas del módulo de autenticación.
 * POST /login es público (sin requireAuth).
 */
import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { authController } from "../controllers/auth.controller.ts";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", authController.login);

