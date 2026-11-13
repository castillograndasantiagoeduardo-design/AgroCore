/**
 * Servicio HTTP del flujo directo de recomendación: terreno, comparación y catálogo con caché en memoria.
 */
import type {
  AnalizarTerrenoInput,
  ComparacionRotacionesDto,
  CompararRotacionesUbicacionInput,
  CultivoDto,
  PerfilTerrenoDto,
} from "@agrocore/contracts";
import { httpClient, type ApiResponse } from "@/lib/http-client";

let cacheCultivos: ApiResponse<CultivoDto[]> | null = null;
let promesaCultivos: Promise<ApiResponse<CultivoDto[]>> | null = null;

export const explorarApi = {
  analizarTerreno: (input: AnalizarTerrenoInput) => httpClient.post<PerfilTerrenoDto>("/api/terreno/analizar", input),
  comparar: (input: CompararRotacionesUbicacionInput) =>
    httpClient.post<ComparacionRotacionesDto>("/api/rotaciones/comparar", input),
  listarCultivos: async (): Promise<ApiResponse<CultivoDto[]>> => {
    if (cacheCultivos) return cacheCultivos;
    if (!promesaCultivos) {
      promesaCultivos = httpClient.get<CultivoDto[]>("/api/cultivos").then((res) => {
        if (res.ok) cacheCultivos = res;
        promesaCultivos = null;
        return res;
      });
    }
    return await promesaCultivos;
  },
};
