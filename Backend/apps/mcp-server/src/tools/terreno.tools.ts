/**
 * Herramientas MCP del módulo terreno. ToolGateway valida, ejecuta y registra.
 */
import { AnalizarTerrenoSchema, MCP_TOOLS } from "@agrocore/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarTerrenoTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.TERRENO_ANALIZAR,
    description:
      "Analiza el terreno de un punto o un polígono (≤ 100 ha) en cualquier lugar del mundo: aptitud para sembrar " +
      "(si cae sobre una carretera responde 'No se puede sembrar: es carretera'; también edificación, agua o uso del suelo), " +
      "elevación y pendiente (SRTM), suelo (SoilGrids), humedad del suelo (NASA POWER), NDVI de MODIS con meses baldíos " +
      "y estrés de vegetación, y cobertura MODIS, con fuentes y vacíos de información. " +
      "Entrada: { area: { tipo: 'punto', latitud, longitud } | { tipo: 'poligono', geojson: Polygon } }.",
    schema: AnalizarTerrenoSchema,
    execute: (input, container, contexto) => container.analizarTerreno.execute(input, contexto),
  });
}
