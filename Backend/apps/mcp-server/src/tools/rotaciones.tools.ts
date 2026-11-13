/**
 * Herramientas MCP del módulo rotaciones. ToolGateway valida, ejecuta y registra.
 */
import { CompararRotacionesSchema, MCP_TOOLS } from "@duitamacrece/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarRotacionesTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.ROTACIONES_COMPARAR,
    description:
      "Compara 3 estrategias de rotación de cultivos de 2 años para una finca de Duitama: A (la actual), " +
      "B (la mejor para el suelo) y C (la mejor para lechería/forraje). Usa el clima calibrado de la finca, " +
      "su altitud, si tiene riego y el catálogo de cultivos. Recibe fincaId, prioridades opcionales " +
      "(agua, suelo, plagas, forraje, ingreso: enteros 0-5, por defecto 3) y secuenciaActual opcional " +
      "(1 a 4 claves de cultivo). Devuelve por estrategia la secuencia, por qué, evidencia, beneficios, " +
      "vacíos de información, riesgos y puntajes. Sugiere y explica: no reemplaza al agrónomo. " +
      "La primera consulta de una finca puede tardar ~45 s por la consulta del clima.",
    schema: CompararRotacionesSchema,
    execute: (input, container, contexto) => container.compararRotaciones.execute(input, contexto),
  });
}
