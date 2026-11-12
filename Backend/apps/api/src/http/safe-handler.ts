/**
 * safeHandler: atrapa SOLO fallos técnicos catastróficos (Regla 3) y responde 500.
 */
import type { Context } from "hono";
import type { AppEnv } from "../types.ts";

export function safeHandler(handler: (c: Context<AppEnv>) => Promise<Response>) {
  return async (c: Context<AppEnv>): Promise<Response> => {
    try {
      return await handler(c);
    } catch (error) {
      console.error("[API] Error técnico no controlado:", error);
      return c.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } }, 500);
    }
  };
}
