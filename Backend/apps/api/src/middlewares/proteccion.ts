/**
 * Protección mínima de la API abierta (sin login ni control de acceso):
 *   - contextoSolicitud: arma el ContextoSolicitud { origen: "api", ip } que usan los casos de uso.
 *   - limitePeticiones:  límite simple de peticiones por IP en memoria (ventana fija), para los
 *                        endpoints que llaman a proveedores externos (NASA, ORNL, Overpass...).
 *
 * El tamaño máximo del body se controla en main.ts con hono/body-limit.
 * ⚠️ Sin login cualquiera que alcance el puerto puede usar la API: aceptable en local y para la demo.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.ts";

function ipCliente(c: Context<AppEnv>): string | null {
  const reenviada = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (reenviada) return reenviada;
  const info = (c.env as { remoteAddr?: { hostname?: string } } | undefined)?.remoteAddr;
  return info?.hostname ?? null;
}

export const contextoSolicitud: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("contexto", { origen: "api", ip: ipCliente(c) });
  await next();
};

export interface OpcionesLimite {
  /** Peticiones permitidas por IP dentro de la ventana. */
  maximo: number;
  /** Duración de la ventana en milisegundos. */
  ventanaMs: number;
}

export function limitePeticiones({ maximo, ventanaMs }: OpcionesLimite): MiddlewareHandler<AppEnv> {
  const contadores = new Map<string, { inicio: number; cantidad: number }>();
  return async (c, next) => {
    const ahora = Date.now();
    const clave = c.get("contexto")?.ip ?? "desconocida";
    const actual = contadores.get(clave);
    if (!actual || ahora - actual.inicio >= ventanaMs) {
      contadores.set(clave, { inicio: ahora, cantidad: 1 });
    } else if (actual.cantidad >= maximo) {
      const segundos = Math.ceil((actual.inicio + ventanaMs - ahora) / 1000);
      c.header("Retry-After", String(segundos));
      return c.json(
        {
          ok: false,
          error: {
            code: "DEMASIADAS_PETICIONES",
            message: "Superaste el límite de " + maximo + " consultas por minuto. Intenta de nuevo en " + segundos + " s.",
          },
        },
        429,
      );
    } else {
      actual.cantidad++;
    }
    // Limpieza ocasional para que el mapa no crezca sin límite.
    if (contadores.size > 5000) {
      for (const [k, v] of contadores) if (ahora - v.inicio >= ventanaMs) contadores.delete(k);
    }
    await next();
  };
}

/** Límite común para los endpoints que consultan proveedores externos (30 por minuto por IP). */
export const limiteProveedoresExternos = limitePeticiones({ maximo: 30, ventanaMs: 60_000 });
