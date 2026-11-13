/**
 * Herramientas MCP del módulo clima. ToolGateway valida, ejecuta y registra.
 */
import { MCP_TOOLS, PerfilClimaticoParamsSchema } from "@agrocore/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarClimaTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.CLIMA_PERFIL_FINCA,
    description:
      "Perfil climático de una finca de Duitama (NASA POWER, últimos 30 años, corregido por altitud): " +
      "lluvia, temperaturas, probabilidad de helada y temporada de cada mes.",
    schema: PerfilClimaticoParamsSchema,
    execute: (input, container, contexto) => container.obtenerPerfilClimatico.execute(input, contexto),
  });
}
