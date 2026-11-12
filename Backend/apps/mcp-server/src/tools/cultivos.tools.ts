/**
 * Herramientas MCP del módulo cultivos. ToolGateway valida, autoriza, ejecuta y registra.
 */
import { ListarCultivosQuerySchema, MCP_TOOLS, ObtenerCultivoParamsSchema, PERMISSIONS } from "@duitamacrece/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarCultivosTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.CULTIVOS_LISTAR,
    description:
      "Catálogo de cultivos de clima frío de Duitama (papa, leguminosas, cereales, forrajes...) con ciclo, " +
      "altitud, tolerancia a helada, agua, fijación de nitrógeno, cobertura y valor forrajero. " +
      "Con altitudM devuelve solo los aptos a esa altitud, primero los óptimos.",
    schema: ListarCultivosQuerySchema,
    permission: PERMISSIONS.CULTIVOS_LEER,
    execute: (input, container, actor) => container.listarCultivos.execute(input, actor),
  });

  gateway.register({
    name: MCP_TOOLS.CULTIVOS_OBTENER,
    description: "Ficha completa de un cultivo por su clave (ej. 'papa', 'avena_vicia'), con notas y fuentes.",
    schema: ObtenerCultivoParamsSchema,
    permission: PERMISSIONS.CULTIVOS_LEER,
    execute: (input, container, actor) => container.obtenerCultivo.execute(input, actor),
  });
}
