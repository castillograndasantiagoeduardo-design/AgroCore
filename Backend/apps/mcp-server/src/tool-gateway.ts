/**
 * ToolGateway: intercepta cada llamada del modelo de IA, valida el esquema Zod,
 * comprueba el permiso RBAC del usuario en sesión, ejecuta el caso de uso del
 * contenedor y registra la ejecución en logs_mcp_tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { type Permission, tienePermiso } from "@duitamacrece/contracts";
import type { AppContainer } from "@duitamacrece/composition";
import type { ContextoActor } from "@duitamacrece/core";
import type { DomainError, Result } from "@duitamacrece/shared-kernel";

export interface ToolDefinition<S extends z.ZodRawShape, T> {
  name: string;
  description: string;
  schema: z.ZodObject<S>;
  permission: Permission;
  execute: (input: z.output<z.ZodObject<S>>, container: AppContainer, actor: ContextoActor) => Promise<Result<T, DomainError>>;
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
    private readonly actor: ContextoActor,
  ) {}

  register<S extends z.ZodRawShape, T>(tool: ToolDefinition<S, T>): void {
    this.server.tool(tool.name, tool.description, tool.schema.shape as z.ZodRawShape, async (args: unknown) => {
      const inicio = Date.now();
      const respuesta = await this.ejecutar(tool, args);
      await this.container.mcpToolLogger
        .registrar({
          herramienta: tool.name,
          usuarioId: this.actor.usuarioId,
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
    if (!tienePermiso(this.actor.rol, tool.permission)) {
      return this.error("PERMISO_DENEGADO", "No tienes permiso: " + tool.permission);
    }

    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      return this.error("VALIDATION_ERROR", JSON.stringify(parsed.error.flatten().fieldErrors));
    }

    try {
      const result = await tool.execute(parsed.data, this.container, this.actor);
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
