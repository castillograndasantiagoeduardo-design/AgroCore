/**
 * ToolGateway: intercepta cada llamada del modelo de IA, valida el esquema Zod (Regla 5),
 * ejecuta el caso de uso del contenedor y registra la ejecución en logs_mcp_tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { AppContainer } from "@agrocore/composition";
import type { ContextoSolicitud } from "@agrocore/core";
import type { DomainError, Result } from "@agrocore/shared-kernel";

export interface ToolDefinition<S extends z.ZodRawShape, T> {
  name: string;
  description: string;
  schema: z.ZodObject<S>;
  execute: (input: z.output<z.ZodObject<S>>, container: AppContainer, contexto: ContextoSolicitud) => Promise<Result<T, DomainError>>;
}

interface ToolResponse {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export class ToolGateway {
  constructor(
    private readonly server: McpServer,
    private readonly container: AppContainer,
    private readonly contexto: ContextoSolicitud,
  ) {}

  register<S extends z.ZodRawShape, T>(tool: ToolDefinition<S, T>): void {
    this.server.tool(tool.name, tool.description, tool.schema.shape as z.ZodRawShape, async (args: unknown) => {
      const inicio = Date.now();
      const respuesta = await this.ejecutar(tool, args);
      await this.container.mcpToolLogger
        .registrar({
          herramienta: tool.name,
          origen: this.contexto.origen,
          argumentos: args,
          exito: !respuesta.isError,
          error: respuesta.isError ? respuesta.content[0].text : null,
          duracionMs: Date.now() - inicio,
        })
        .catch((error) => console.error("[MCP] No se pudo registrar en logs_mcp_tools:", error));
      return respuesta;
    });
  }

  private async ejecutar<S extends z.ZodRawShape, T>(tool: ToolDefinition<S, T>, args: unknown): Promise<ToolResponse> {
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      return this.error("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten().fieldErrors));
    }

    try {
      const result = await tool.execute(parsed.data, this.container, this.contexto);
      if (!result.ok) return this.error(result.error.code, result.error.message);
      return { content: [{ type: "text", text: JSON.stringify(result.value, null, 2) }] };
    } catch (error) {
      console.error("[MCP] Error técnico no controlado:", error);
      return this.error("INTERNAL_ERROR", "Error interno al ejecutar la herramienta");
    }
  }

  private error(code: string, message: string): ToolResponse {
    return { isError: true, content: [{ type: "text", text: code + ": " + message }] };
  }
}
