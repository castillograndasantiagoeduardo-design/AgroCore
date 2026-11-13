/**
 * Servicio HTTP de fincas, tipado con @agrocore/contracts.
 */
import type { CrearFincaInput, FincaDto } from "@agrocore/contracts";
import { httpClient } from "@/lib/http-client";
import type { PaginaFincas } from "../types/fincas.types";

export const fincasApi = {
  listar: (page = 1, pageSize = 20) => httpClient.get<PaginaFincas>("/api/fincas?page=" + page + "&pageSize=" + pageSize),
  crear: (input: CrearFincaInput) => httpClient.post<FincaDto>("/api/fincas", input),
};
