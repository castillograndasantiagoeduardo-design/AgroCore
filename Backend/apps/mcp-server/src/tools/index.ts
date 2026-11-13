/**
 * Registro central de herramientas MCP.
 */
import type { ToolGateway } from "../tool-gateway.ts";
import { registrarClimaTools } from "./clima.tools.ts";
import { registrarCultivosTools } from "./cultivos.tools.ts";
import { registrarRotacionesTools } from "./rotaciones.tools.ts";
import { registrarTerrenoTools } from "./terreno.tools.ts";
import { registrarImpresionTools } from "./impresion.tools.ts";
import { registrarRecomendacionTools } from "./recomendacion.tools.ts";
// @scaffold:imports

export function registrarTools(gateway: ToolGateway): void {
  registrarClimaTools(gateway);
  registrarCultivosTools(gateway);
  registrarRotacionesTools(gateway);
  registrarTerrenoTools(gateway);
  registrarImpresionTools(gateway);
  registrarRecomendacionTools(gateway);
  // @scaffold:tools
}
