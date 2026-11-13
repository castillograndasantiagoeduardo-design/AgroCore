/**
 * Herramientas MCP del módulo cultivos. ToolGateway valida, ejecuta y registra.
 */
import { ListarCultivosQuerySchema, MCP_TOOLS, ObtenerCultivoParamsSchema } from "@duitamacrece/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarCultivosTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.CULTIVOS_LISTAR,
    description:
      "Catálogo de cultivos de clima frío de Duitama (papa, leguminosas, cereales, forrajes...) con ciclo, " +
      "altitud, tolerancia a helada, agua, fijación de nitrógeno, cobertura y valor forrajero. " +
      "Con altitudM devuelve solo los aptos a esa altitud, primero los óptimos.",
    schema: ListarCultivosQuerySchema,
    execute: (input, container, contexto) => container.listarCultivos.execute(input, contexto),
  });

  gateway.register({
    name: MCP_TOOLS.CULTIVOS_OBTENER,
    description: "Ficha completa de un cultivo por su clave (ej. 'papa', 'avena_vicia'), con notas y fuentes.",
    schema: ObtenerCultivoParamsSchema,
    execute: (input, container, contexto) => container.obtenerCultivo.execute(input, contexto),
  });
}
