/**
 * Herramienta MCP de la recomendación por época del año. ToolGateway valida (Zod), ejecuta y registra.
 */
import { MCP_TOOLS, RecomendacionInputSchema } from "@agrocore/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarRecomendacionTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.RECOMENDACION_POR_EPOCA,
    description:
      "Qué sembrar en cada época del año en CUALQUIER punto o polígono (≤ 100 ha) del mundo. Recibe area " +
      "({tipo:'punto',latitud,longitud} o {tipo:'poligono',geojson}), cultivoActual opcional (clave del catálogo), tieneRiego y objetivo " +
      "(equilibrado, mejorar_suelo, ahorrar_agua, mas_ingreso). Devuelve la aptitud del terreno ('No se puede sembrar: es carretera' si cae " +
      "sobre una vía), el clima resumido, las épocas del año derivadas del clima (lluviosa, seca, heladas, calor, invierno) y, para los 4 " +
      "objetivos, el mejor cultivo y una alternativa por época con por qué, cuidado principal y fuentes. Toda cifra viaja con su fuente " +
      "(DatoConFuente). Prefiere cultivos que se siembran en la zona (EVA en Colombia, FAOSTAT fuera); los poco comunes salen como " +
      "alternativa con advertencia. Sugiere y explica: no reemplaza al agrónomo.",
    schema: RecomendacionInputSchema,
    execute: (input, container, contexto) => container.recomendacionRapida.execute(input, contexto),
  });
}
