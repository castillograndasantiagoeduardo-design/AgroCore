/**
 * Servicio HTTP de impresión del ticket térmico (58 mm), tipado con @agrocore/contracts.
 */
import type { ImprimirTicketTerrenoInput, ResultadoImpresionDto } from "@agrocore/contracts";
import { httpClient } from "@/lib/http-client";

export const impresionApi = {
  imprimirTerreno: (input: ImprimirTicketTerrenoInput) => httpClient.post<ResultadoImpresionDto>("/api/impresion/terreno", input),
};
