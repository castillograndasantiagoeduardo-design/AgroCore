/**
 * Servicio HTTP de rotaciones, tipado con @duitamacrece/contracts.
 */
import type { ComparacionRotacionesDto, CompararRotacionesInput } from "@duitamacrece/contracts";
import { httpClient } from "@/lib/http-client";

/** Cuerpo del POST: la entrada completa sin el fincaId (que va en la URL). */
export type CompararRotacionesBody = Omit<CompararRotacionesInput, "fincaId">;

export const rotacionesApi = {
  comparar: (fincaId: number, body: CompararRotacionesBody) =>
    httpClient.post<ComparacionRotacionesDto>("/api/rotaciones/fincas/" + fincaId + "/comparar", body),
};
