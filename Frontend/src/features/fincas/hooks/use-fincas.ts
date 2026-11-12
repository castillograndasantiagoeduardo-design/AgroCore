"use client";

/**
 * Estado, paginación y mutaciones del módulo fincas.
 */
import { useCallback, useEffect, useState } from "react";
import { CrearFincaSchema, type CrearFincaInput } from "@duitamacrece/contracts";
import { fincasApi } from "../api/fincas.api";
import type { PaginaFincas } from "../types/fincas.types";

export function useFincas() {
  const [pagina, setPagina] = useState<PaginaFincas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (page = 1) => {
    setCargando(true);
    const res = await fincasApi.listar(page);
    if (res.ok) {
      setPagina(res.data);
      setError(null);
    } else {
      setError(res.error.message);
    }
    setCargando(false);
  }, []);

  const crear = useCallback(async (input: CrearFincaInput): Promise<boolean> => {
    const parsed = CrearFincaSchema.safeParse(input);
    if (!parsed.success) {
      setError("Datos inválidos: revisa el formulario.");
      return false;
    }
    const res = await fincasApi.crear(parsed.data);
    if (!res.ok) {
      setError(res.error.message);
      return false;
    }
    await cargar(pagina?.page ?? 1);
    return true;
  }, [cargar, pagina?.page]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { pagina, cargando, error, cargar, crear };
}
