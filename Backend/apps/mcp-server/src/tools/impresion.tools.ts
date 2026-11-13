/**
 * Herramientas MCP del módulo impresion. ToolGateway valida, ejecuta y registra.
 */
import { ImprimirTicketTerrenoSchema, MCP_TOOLS } from "@agrocore/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarImpresionTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.IMPRESION_TERRENO,
    description:
      "Imprime en la térmica de 58 mm (Xprinter compartida en Windows) un ticket con el resumen del terreno: aptitud, suelo, " +
      "meses baldíos y vulnerables, las estrategias con su puntaje, fuentes y el aviso 'Validar con agrónomo local'. Misma entrada " +
      "que rotaciones_comparar_ubicacion más nombre opcional; con soloVistaPrevia=true devuelve las líneas sin imprimir. " +
      "Si la impresora no está disponible responde IMPRESORA_NO_DISPONIBLE.",
    schema: ImprimirTicketTerrenoSchema,
    execute: (input, container, contexto) => container.imprimirTicketTerreno.execute(input, contexto),
  });
}
