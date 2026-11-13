"use client";

/**
 * Estado de la comparación de rotaciones de una finca.
 */
import { useCallback, useState } from "react";
import {
  CompararRotacionesBodySchema,
  type ComparacionRotacionesDto,
  type PrioridadesRotacion,
} from "@agrocore/contracts";
import { rotacionesApi } from "../api/rotaciones.api";

export function useComparacionRotaciones() {
  const [comparacion, setComparacion] = useState<ComparacionRotacionesDto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comparar = useCallback(async (fincaId: number, prioridades: PrioridadesRotacion): Promise<boolean> => {
    const parsed = CompararRotacionesBodySchema.safeParse({ prioridades });
    if (!parsed.success) {
      setError("Prioridades inválidas: cada una debe ser un entero entre 0 y 5.");
      return false;
    }
    setCargando(true);
    setError(null);
    const res = await rotacionesApi.comparar(fincaId, parsed.data);
    setCargando(false);
    if (!res.ok) {
      setError(res.error.message);
      return false;
    }
    setComparacion(res.data);
    return true;
  }, []);

  return { comparacion, cargando, error, comparar };
}
