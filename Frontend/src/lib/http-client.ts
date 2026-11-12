/**
 * Cliente HTTP único del Frontend. Renueva el access token con el refresh_token
 * (cookie httpOnly) cuando la API responde 401 y reintenta una vez.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; detalles?: unknown } };

/**
 * SOLO DESARROLLO, mientras no exista el login: token emitido con Backend/scripts/emitir-token.ts --frontend
 * (queda en Frontend/.env.local). En producción se ignora. Quitar cuando haya login.
 */
const TOKEN_DESARROLLO = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN ?? null : null;

let accessToken: string | null = TOKEN_DESARROLLO;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function renovarToken(): Promise<boolean> {
  try {
    const res = await fetch(API_URL + "/api/auth/refresh", { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    const body = (await res.json()) as ApiResponse<{ accessToken: string }>;
    if (!body.ok) return false;
    accessToken = body.data.accessToken;
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init: RequestInit = {}, reintentar = true): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", "Bearer " + accessToken);

  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers, credentials: "include" });
  } catch {
    return { ok: false, error: { code: "RED_NO_DISPONIBLE", message: "No se pudo conectar con la API" } };
  }

  if (res.status === 401 && reintentar && (await renovarToken())) {
    return request<T>(path, init, false);
  }

  try {
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return { ok: false, error: { code: "RESPUESTA_INVALIDA", message: "HTTP " + res.status } };
  }
}

export const httpClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
