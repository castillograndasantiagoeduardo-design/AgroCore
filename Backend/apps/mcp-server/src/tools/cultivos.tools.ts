/**
 * Herramientas MCP del módulo cultivos. ToolGateway valida, ejecuta y registra.
 */
import { ListarCultivosQuerySchema, MCP_TOOLS, ObtenerCultivoParamsSchema } from "@agrocore/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarCultivosTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.CULTIVOS_LISTAR,
    description:
      "Catálogo GLOBAL de 51 cultivos (cereales, leguminosas, tubérculos, hortalizas, oleaginosas, forrajes, coberturas) con ciclo, " +
      "temperatura óptima y absoluta (FAO ECOCROP), tolerancias a helada, calor y sequía, pH, textura, fijación de N, plagas clave y fuentes. " +
      "Con tempMediaC (temperatura media del sitio) devuelve solo los aptos, primero los óptimos; filtros: lluviaAnualMm, ph, textura, familia, uso, grupo.",
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
