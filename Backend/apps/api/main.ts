/**
 * Servidor HTTP REST (Hono). Adaptador primario: solo consume el contenedor ya ensamblado.
 * API abierta (sin login): CORS restringido al Frontend, límite de body y límite de peticiones por IP.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { createContainer, loadConfigFromEnv } from "@agrocore/composition";
import type { AppEnv } from "./src/types.ts";
import { registrarRutas } from "./src/routes/index.ts";
import { contextoSolicitud } from "./src/middlewares/proteccion.ts";

const container = createContainer(loadConfigFromEnv());
const app = new Hono<AppEnv>();

/** Origen permitido por CORS: FRONTEND_ORIGIN (o el antiguo FRONTEND_URL). */
const frontendOrigin = Deno.env.get("FRONTEND_ORIGIN") ?? Deno.env.get("FRONTEND_URL") ?? "http://localhost:3000";
/** Tamaño máximo del cuerpo JSON (un polígono de 100 vértices ocupa ~5 KB). */
const BODY_MAXIMO_BYTES = 64 * 1024;

app.use("*", cors({ origin: frontendOrigin }));
app.use(
  "*",
  bodyLimit({
    maxSize: BODY_MAXIMO_BYTES,
    onError: (c) =>
      c.json(
        { ok: false, error: { code: "BODY_DEMASIADO_GRANDE", message: "El cuerpo supera " + BODY_MAXIMO_BYTES / 1024 + " KB." } },
        413,
      ),
  }),
);
app.use("*", async (c, next) => {
  c.set("container", container);
  await next();
});
app.use("*", contextoSolicitud);

app.get("/api/health", (c) => c.json({ ok: true, data: { estado: "saludable", timestamp: new Date().toISOString() } }));

registrarRutas(app);

const port = Number(Deno.env.get("PORT") ?? "8001");
console.log("🚀 API AgroCore escuchando en http://localhost:" + port + " (CORS: " + frontendOrigin + ")");
Deno.serve({ port }, app.fetch);
