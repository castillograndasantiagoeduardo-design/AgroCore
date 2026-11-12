/**
 * Servidor HTTP REST (Hono). Adaptador primario: solo consume el contenedor ya ensamblado.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createContainer, loadConfigFromEnv } from "@duitamacrece/composition";
import type { AppEnv } from "./src/types.ts";
import { registrarRutas } from "./src/routes/index.ts";

const container = createContainer(loadConfigFromEnv());
const app = new Hono<AppEnv>();

app.use("*", cors({ origin: Deno.env.get("FRONTEND_URL") ?? "http://localhost:3000", credentials: true }));
app.use("*", async (c, next) => {
  c.set("container", container);
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, data: { estado: "saludable", timestamp: new Date().toISOString() } }));

registrarRutas(app);

const port = Number(Deno.env.get("PORT") ?? "8001");
console.log("🚀 API AgroCore escuchando en http://localhost:" + port);
Deno.serve({ port }, app.fetch);
