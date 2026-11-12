/**
 * Servicio HTTP del catálogo de cultivos, tipado con @duitamacrece/contracts.
 */
import type { CultivoDto } from "@duitamacrece/contracts";
import { httpClient } from "@/lib/http-client";

export const cultivosApi = {
  listar: () => httpClient.get<CultivoDto[]>("/api/cultivos"),
};
