"use client";

/**
 * Estado del flujo Explorar con carga PROGRESIVA:
 * 1) analiza el terreno y lo muestra apenas llega; 2) si el sitio es apto, compara rotaciones (clima 30 años).
 * Si el terreno no es apto, NO llama a comparar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CompararRotacionesUbicacionSchema,
  type AreaSeleccionadaDto,
  type ComparacionRotacionesDto,
  type CompararRotacionesUbicacionInput,
  type CultivoDto,
  type PerfilTerrenoDto,
} from "@agrocore/contracts";
import { explorarApi } from "../api/explorar.api";
import { FUENTES_CLIMA, FUENTES_TERRENO, type EntradaSitio, type FaseExplorar } from "../types/explorar.types";

export function useExplorar() {
  const [area, setAreaEstado] = useState<AreaSeleccionadaDto | null>(null);
  const [fase, setFase] = useState<FaseExplorar>("inactivo");
  const [perfil, setPerfil] = useState<PerfilTerrenoDto | null>(null);
  const [comparacion, setComparacion] = useState<ComparacionRotacionesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [entradaEnviada, setEntradaEnviada] = useState<CompararRotacionesUbicacionInput | null>(null);

  const [cultivos, setCultivos] = useState<CultivoDto[]>([]);
  const [errorCultivos, setErrorCultivos] = useState<string | null>(null);

  // Identifica la petición vigente para ignorar respuestas de análisis anteriores.
  const peticionRef = useRef(0);

  useEffect(() => {
    let activo = true;
    explorarApi.listarCultivos().then((res) => {
      if (!activo) return;
      if (res.ok) setCultivos(res.data);
      else setErrorCultivos(res.error.message);
    });
    return () => {
      activo = false;
    };
  }, []);

  // Contador de segundos de la etapa en curso.
  const cargando = fase === "terreno" || fase === "clima";
  useEffect(() => {
    if (!cargando) return;
    setSegundos(0);
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [fase, cargando]);

  const setArea = useCallback((nueva: AreaSeleccionadaDto | null) => {
    peticionRef.current++; // invalida cualquier análisis en curso
    setAreaEstado(nueva);
    setFase("inactivo");
    setPerfil(null);
    setComparacion(null);
    setError(null);
    setCodigoError(null);
    setEntradaEnviada(null);
  }, []);

  const analizar = useCallback(
    async (entrada: EntradaSitio) => {
      if (!area) {
        setError("Marca un punto o dibuja un área en el mapa.");
        setFase("error");
        return;
      }
      const parsed = CompararRotacionesUbicacionSchema.safeParse({
        area,
        cultivoActual: entrada.cultivoActual,
        secuenciaActual: entrada.secuenciaActual && entrada.secuenciaActual.length > 0 ? entrada.secuenciaActual : undefined,
        tieneRiego: entrada.tieneRiego,
        prioridades: entrada.prioridades,
        altitudM: entrada.altitudM,
      });
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => i.message).join(" · "));
        setCodigoError("VALIDACION");
        setFase("error");
        return;
      }

      const id = ++peticionRef.current;
      setError(null);
      setCodigoError(null);
      setPerfil(null);
      setComparacion(null);
      setEntradaEnviada(parsed.data);

      // Etapa 1: terreno
      setFase("terreno");
      const resT = await explorarApi.analizarTerreno({ area });
      if (id !== peticionRef.current) return;
      if (!resT.ok) {
        setError(resT.error.message);
        setCodigoError(resT.error.code);
        setFase("error");
        return;
      }
      setPerfil(resT.data);
      if (resT.data.aptitud !== "apto") {
        setFase("no_apto");
        return;
      }

      // Etapa 2: clima + rotaciones
      setFase("clima");
      const resC = await explorarApi.comparar(parsed.data);
      if (id !== peticionRef.current) return;
      if (!resC.ok) {
        setError(resC.error.message);
        setCodigoError(resC.error.code);
        setFase(resC.error.code === "TERRENO_NO_APTO" ? "no_apto" : "error");
        return;
      }
      setComparacion(resC.data);
      setFase("listo");
    },
    [area],
  );

  const fuentesEtapa = fase === "clima" ? FUENTES_CLIMA : FUENTES_TERRENO;
  const fuenteActual = cargando ? fuentesEtapa[Math.floor(segundos / 4) % fuentesEtapa.length] : null;

  return {
    area,
    setArea,
    fase,
    cargando,
    perfil,
    comparacion,
    error,
    codigoError,
    segundos,
    fuenteActual,
    entradaEnviada,
    cultivos,
    errorCultivos,
    analizar,
  };
}
