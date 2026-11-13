/**
 * Registro central de herramientas MCP.
 */
import type { ToolGateway } from "../tool-gateway.ts";
import { registrarFincasTools } from "./fincas.tools.ts";
import { registrarClimaTools } from "./clima.tools.ts";
import { registrarCultivosTools } from "./cultivos.tools.ts";
import { registrarRotacionesTools } from "./rotaciones.tools.ts";
import { registrarTerrenoTools } from "./terreno.tools.ts";
// @scaffold:imports

export function registrarTools(gateway: ToolGateway): void {
  registrarFincasTools(gateway);
  registrarClimaTools(gateway);
  registrarCultivosTools(gateway);
  registrarRotacionesTools(gateway);
  registrarTerrenoTools(gateway);
  // @scaffold:tools
}
