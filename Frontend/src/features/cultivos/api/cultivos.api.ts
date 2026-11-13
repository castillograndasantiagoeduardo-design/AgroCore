/**
 * Servicio HTTP del catálogo de cultivos, tipado con @agrocore/contracts.
 */
import type { CultivoDto } from "@agrocore/contracts";
import { httpClient } from "@/lib/http-client";

export const cultivosApi = {
  listar: () => httpClient.get<CultivoDto[]>("/api/cultivos"),
};
