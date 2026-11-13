/**
 * Servicio HTTP del flujo "Explorar": terreno, comparación, catálogo y guardado de finca.
 */
import type {
  AnalizarTerrenoInput,
  ComparacionRotacionesDto,
  CompararRotacionesUbicacionInput,
  CrearFincaInput,
  CultivoDto,
  FincaDto,
  PerfilTerrenoDto,
} from "@agrocore/contracts";
import { httpClient } from "@/lib/http-client";

export const explorarApi = {
  analizarTerreno: (input: AnalizarTerrenoInput) => httpClient.post<PerfilTerrenoDto>("/api/terreno/analizar", input),
  comparar: (input: CompararRotacionesUbicacionInput) =>
    httpClient.post<ComparacionRotacionesDto>("/api/rotaciones/comparar", input),
  listarCultivos: () => httpClient.get<CultivoDto[]>("/api/cultivos"),
  guardarFinca: (input: CrearFincaInput) => httpClient.post<FincaDto>("/api/fincas", input),
};
