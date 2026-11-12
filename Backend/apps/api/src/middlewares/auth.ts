/**
 * Middlewares: verifican el JWT, extraen usuario e IP y comprueban el permiso RBAC de la ruta.
 */
import type { MiddlewareHandler } from "hono";
import { type Permission, tienePermiso } from "@duitamacrece/contracts";
import type { AppEnv } from "../types.ts";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ ok: false, error: { code: "NO_AUTENTICADO", message: "Token no suministrado." } }, 401);
  }

  const verificado = await c.get("container").tokenService.verificar(header.slice(7).trim());
  if (!verificado.ok) {
    return c.json({ ok: false, error: { code: verificado.error.code, message: verificado.error.message } }, 401);
  }

  c.set("actor", {
    usuarioId: verificado.value.usuarioId,
    rol: verificado.value.rol,
    ip: c.req.header("x-forwarded-for") ?? null,
  });
  await next();
};

export function requirePermission(permiso: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!tienePermiso(c.get("actor").rol, permiso)) {
      return c.json({ ok: false, error: { code: "PERMISO_DENEGADO", message: "No tienes permiso: " + permiso } }, 403);
    }
    await next();
  };
}
