/**
 * Agregador central de rutas de la API.
 */
import type { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { fincasRoutes } from "./fincas.routes.ts";
import { climaRoutes } from "./clima.routes.ts";
import { cultivosRoutes } from "./cultivos.routes.ts";
import { rotacionesRoutes } from "./rotaciones.routes.ts";
import { terrenoRoutes } from "./terreno.routes.ts";
// @scaffold:imports

export function registrarRutas(app: Hono<AppEnv>): void {
  app.route("/api/fincas", fincasRoutes);
  app.route("/api/clima", climaRoutes);
  app.route("/api/cultivos", cultivosRoutes);
  app.route("/api/rotaciones", rotacionesRoutes);
  app.route("/api/terreno", terrenoRoutes);
  // @scaffold:routes
}
