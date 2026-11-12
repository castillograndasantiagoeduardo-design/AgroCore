/**
 * Herramientas MCP del módulo fincas. ToolGateway valida, autoriza, ejecuta y registra.
 */
import { CrearFincaSchema, ListarFincasQuerySchema, MCP_TOOLS, PERMISSIONS } from "@duitamacrece/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarFincasTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.FINCAS_LISTAR,
    description: "Lista fincas paginados.",
    schema: ListarFincasQuerySchema,
    permission: PERMISSIONS.FINCAS_LEER,
    execute: (input, container, actor) => container.listarFincas.execute(input, actor),
  });

  gateway.register({
    name: MCP_TOOLS.FINCAS_CREAR,
    description: "Crea un finca.",
    schema: CrearFincaSchema,
    permission: PERMISSIONS.FINCAS_CREAR,
    execute: (input, container, actor) => container.crearFinca.execute(input, actor),
  });
}
