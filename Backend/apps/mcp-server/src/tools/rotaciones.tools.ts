/**
 * Herramientas MCP del módulo rotaciones. ToolGateway valida, ejecuta y registra.
 */
import { CompararRotacionesUbicacionSchema, MCP_TOOLS } from "@agrocore/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

const QUE_DEVUELVE =
  "Devuelve 3 o 4 estrategias de 2 años en las temporadas reales del sitio (A actual, B suelo, C forraje/ingreso, D agua si hay " +
  "déficit o la prioridad de agua es ≥ 4), cada una con por qué, evidencia con fuente (NASA POWER, MODIS, SoilGrids, SRTM, ECOCROP, " +
  "OpenStreetMap), beneficios, vacíos de información, riesgos, reglas y puntajes; más un calendario de 12 meses (baldío / " +
  "vulnerable / oportunidad) y oportunidades. Si el sitio cae sobre una vía responde TERRENO_NO_APTO: 'No se puede sembrar: es carretera'. " +
  "Sugiere y explica: no reemplaza al agrónomo. La primera consulta de un lugar puede tardar ~1 min (30 años de clima).";

export function registrarRotacionesTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.ROTACIONES_COMPARAR_UBICACION,
    description:
      "Compara estrategias de rotación para CUALQUIER punto o polígono (≤ 100 ha) del mundo. Recibe area " +
      "({tipo:'punto',latitud,longitud} o {tipo:'poligono',geojson}), tieneRiego, prioridades " +
      "y opcionales cultivoActual (clave del catálogo), secuenciaActual y altitudM. " + QUE_DEVUELVE,
    schema: CompararRotacionesUbicacionSchema,
    execute: (input, container, contexto) => container.compararRotacionesUbicacion.execute(input, contexto),
  });
}
