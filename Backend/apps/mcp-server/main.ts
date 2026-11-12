/**
 * Servidor MCP para Agentes IA (stdio). Adaptador primario: solo consume el contenedor.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createContainer, loadConfigFromEnv } from "@duitamacrece/composition";
import { ToolGateway } from "./src/tool-gateway.ts";
import { registrarTools } from "./src/tools/index.ts";

const container = createContainer(loadConfigFromEnv());

const token = Deno.env.get("MCP_ACCESS_TOKEN");
if (!token) {
  console.error("[MCP] Falta MCP_ACCESS_TOKEN (token JWT del usuario en sesión).");
  Deno.exit(1);
}

const sesion = await container.tokenService.verificar(token);
if (!sesion.ok) {
  console.error("[MCP] " + sesion.error.message);
  Deno.exit(1);
}

const server = new McpServer({ name: "agrocore-mcp-server", version: "0.1.0" });
const gateway = new ToolGateway(server, container, { usuarioId: sesion.value.usuarioId, rol: sesion.value.rol, ip: null });

registrarTools(gateway);

await server.connect(new StdioServerTransport());
console.error("[MCP] AgroCore mcp-server escuchando en stdio");
