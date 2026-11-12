/**
 * SOLO DESARROLLO: emite un JWT de administrador firmado con el JWT_SECRET del .env, para probar la API
 * y el Frontend mientras no exista el módulo de login. Borrar este script cuando haya login.
 *
 * Uso (desde Backend/):
 *   deno run -A --env-file=../.env scripts/emitir-token.ts            → imprime el token (pégalo en los .http)
 *   deno run -A --env-file=../.env scripts/emitir-token.ts --frontend → además lo guarda en Frontend/.env.local
 *
 * El token dura 8 horas (no usa JWT_EXPIRATION, que es para sesiones reales).
 */
import { JwtTokenService } from "@duitamacrece/platform";
import { ROLES } from "@duitamacrece/contracts";

const secreto = Deno.env.get("JWT_SECRET");
if (!secreto) {
  console.error("Falta JWT_SECRET. Ejecuta con --env-file=../.env desde Backend/.");
  Deno.exit(1);
}

const token = await new JwtTokenService(secreto, "8h").firmar({ usuarioId: 1, rol: ROLES.ADMIN });

if (Deno.args.includes("--frontend")) {
  const ruta = new URL("../../Frontend/.env.local", import.meta.url);
  await Deno.writeTextFile(ruta, "# Generado por Backend/scripts/emitir-token.ts (solo desarrollo, vence en 8 h)\nNEXT_PUBLIC_DEV_ACCESS_TOKEN=" + token + "\n");
  console.log("Token guardado en Frontend/.env.local (NEXT_PUBLIC_DEV_ACCESS_TOKEN).");
}
if (!Deno.args.includes("--silencioso")) console.log(token);
