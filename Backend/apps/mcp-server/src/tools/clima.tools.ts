/**
 * Herramientas MCP del módulo clima. ToolGateway valida, autoriza, ejecuta y registra.
 */
import { MCP_TOOLS, PerfilClimaticoParamsSchema, PERMISSIONS } from "@duitamacrece/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarClimaTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.CLIMA_PERFIL_FINCA,
    description:
      "Perfil climático de una finca de Duitama (NASA POWER, últimos 30 años, corregido por altitud): " +
      "lluvia, temperaturas, probabilidad de helada y temporada de cada mes.",
    schema: PerfilClimaticoParamsSchema,
    permission: PERMISSIONS.CLIMA_LEER,
    execute: (input, container, actor) => container.obtenerPerfilClimatico.execute(input, actor),
  });
}
