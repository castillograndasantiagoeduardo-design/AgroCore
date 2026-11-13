/**
 * Cliente HTTP único del Frontend. La API es abierta (sin login): no envía cabeceras de sesión.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; detalles?: unknown } };

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers });
  } catch {
    return { ok: false, error: { code: "RED_NO_DISPONIBLE", message: "No se pudo conectar con la API" } };
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
