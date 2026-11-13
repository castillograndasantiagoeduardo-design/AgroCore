/**
 * Nombres oficiales de las herramientas MCP expuestas por apps/mcp-server.
 */

export const MCP_TOOLS = {
  FINCAS_LISTAR: "fincas_listar",
  FINCAS_CREAR: "fincas_crear",
  CLIMA_PERFIL_FINCA: "clima_perfil_finca",
  CULTIVOS_LISTAR: "cultivos_listar",
  CULTIVOS_OBTENER: "cultivos_obtener",
  ROTACIONES_COMPARAR: "rotaciones_comparar",
  TERRENO_ANALIZAR: "terreno_analizar",
  ROTACIONES_COMPARAR_UBICACION: "rotaciones_comparar_ubicacion",
  IMPRESION_TERRENO: "impresion_terreno",
  RECOMENDACION_POR_EPOCA: "recomendacion_por_epoca",
  // @scaffold:mcp-tools
} as const;

export type McpToolName = (typeof MCP_TOOLS)[keyof typeof MCP_TOOLS];
