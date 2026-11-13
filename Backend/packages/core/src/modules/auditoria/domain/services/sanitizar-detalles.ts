/**
 * Servicio de dominio puro: elimina campos sensibles antes de auditar.
 * Jamás se registran contraseñas, secretos, tokens de acceso ni códigos de recuperación.
 */

const CAMPOS_SENSIBLES = new Set([
  "password",
  "password_hash",
  "passwordHash",
  "totp_secret",
  "totpSecret",
  "token",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "codigos_recuperacion",
  "codigosRecuperacion",
]);

export function sanitizarDetalles<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((v) => sanitizarDetalles(v)) as T;
  }
  if (valor !== null && typeof valor === "object" && !(valor instanceof Date)) {
    const limpio: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor)) {
      if (!CAMPOS_SENSIBLES.has(clave)) limpio[clave] = sanitizarDetalles(v);
    }
    return limpio as T;
  }
  return valor;
}
