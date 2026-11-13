/**
 * Herramientas MCP del módulo fincas. ToolGateway valida, ejecuta y registra.
 */
import { CrearFincaSchema, ListarFincasQuerySchema, MCP_TOOLS } from "@agrocore/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarFincasTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.FINCAS_LISTAR,
    description: "Lista fincas paginados.",
    schema: ListarFincasQuerySchema,
    execute: (input, container, contexto) => container.listarFincas.execute(input, contexto),
  });

  gateway.register({
    name: MCP_TOOLS.FINCAS_CREAR,
    description: "Crea un finca.",
    schema: CrearFincaSchema,
    execute: (input, container, contexto) => container.crearFinca.execute(input, contexto),
  });
}
