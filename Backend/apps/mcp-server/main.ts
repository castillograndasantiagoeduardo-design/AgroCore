/**
 * Servidor MCP para Agentes IA (stdio). Adaptador primario: solo consume el contenedor.
 * Sin login: el servidor corre en local para el agente que lo lanza; la auditoría registra origen "mcp".
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createContainer, loadConfigFromEnv } from "@agrocore/composition";
import { ToolGateway } from "./src/tool-gateway.ts";
import { registrarTools } from "./src/tools/index.ts";

const container = createContainer(loadConfigFromEnv());

const server = new McpServer({ name: "agrocore-mcp-server", version: "0.2.0" });
const gateway = new ToolGateway(server, container, { origen: "mcp", ip: null });

registrarTools(gateway);

await server.connect(new StdioServerTransport());
console.error("[MCP] AgroCore mcp-server escuchando en stdio");
