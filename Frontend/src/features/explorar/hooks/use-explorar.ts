"use client";

/**
 * Hook principal de recomendación agrícola:
 * - Ejecución en paralelo de análisis de terreno y clima/rotaciones para reducir el tiempo de espera a la mitad.
 * - Caché en memoria de consultas por ubicación/cultivo/riego para respuesta instantánea al repetir o cambiar de objetivo/época.
 * - Cálculo reactivo inmediato (0 ms) al alternar entre objetivos ("Equilibrado", "Mejorar el suelo", "Ahorrar agua", "Mayores ingresos")
 *   y épocas del año.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CompararRotacionesUbicacionSchema,
  type AreaSeleccionadaDto,
  type ComparacionRotacionesDto,
  type CompararRotacionesUbicacionInput,
  type CultivoDto,
  type PerfilTerrenoDto,
} from "@agrocore/contracts";
import { explorarApi } from "../api/explorar.api";
import {
  FUENTES_CLIMA,
  FUENTES_TERRENO,
  OBJETIVOS_PRINCIPALES,
  UBICACIONES_RAPIDAS,
  resolverRecomendacionPorObjetivoYEpoca,
  type EntradaSitio,
  type EpocaConsulta,
  type FaseExplorar,
  type ObjetivoPrincipal,
} from "../types/explorar.types";

interface EntradaCache {
  perfil: PerfilTerrenoDto;
  comparacion: ComparacionRotacionesDto | null;
}

export function useExplorar() {
  const [area, setAreaEstado] = useState<AreaSeleccionadaDto | null>(UBICACIONES_RAPIDAS[0].area);
  const [objetivo, setObjetivo] = useState<ObjetivoPrincipal>("equilibrado");
  const [epoca, setEpoca] = useState<EpocaConsulta>("actual");
  const [fase, setFase] = useState<FaseExplorar>("inactivo");
  const [perfil, setPerfil] = useState<PerfilTerrenoDto | null>(null);
  const [comparacion, setComparacion] = useState<ComparacionRotacionesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [entradaEnviada, setEntradaEnviada] = useState<CompararRotacionesUbicacionInput | null>(null);

  const [cultivos, setCultivos] = useState<CultivoDto[]>([]);
  const [errorCultivos, setErrorCultivos] = useState<string | null>(null);

  const peticionRef = useRef(0);
  const cacheRef = useRef<Map<string, EntradaCache>>(new Map());

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

  const cargando = fase === "terreno" || fase === "clima";
  useEffect(() => {
    if (!cargando) return;
    setSegundos(0);
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [fase, cargando]);

  const setArea = useCallback((nueva: AreaSeleccionadaDto | null) => {
    peticionRef.current++;
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
        setError("Selecciona un punto o dibuja un lote en el mapa para continuar.");
        setFase("error");
        return;
      }

      if (entrada.objetivo) setObjetivo(entrada.objetivo);
      if (entrada.epoca) setEpoca(entrada.epoca);

      const objDef = OBJETIVOS_PRINCIPALES.find((o) => o.id === (entrada.objetivo ?? objetivo)) ?? OBJETIVOS_PRINCIPALES[0];
      // Garantizamos agua >= 4 en la consulta al motor para que genere siempre las 4 estrategias (A, B, C y D)
      // y el cambio posterior entre objetivos sea instantáneo sin volver a consultar la red.
      const prioridadesMotor = {
        ...objDef.prioridades,
        agua: Math.max(objDef.prioridades.agua, 4),
      };

      const parsed = CompararRotacionesUbicacionSchema.safeParse({
        area,
        cultivoActual: entrada.cultivoActual,
        secuenciaActual: entrada.secuenciaActual && entrada.secuenciaActual.length > 0 ? entrada.secuenciaActual : undefined,
        tieneRiego: entrada.tieneRiego,
        prioridades: prioridadesMotor,
        altitudM: entrada.altitudM,
      });
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => i.message).join(" · "));
        setCodigoError("VALIDACION");
        setFase("error");
        return;
      }

      const claveCache = JSON.stringify({
        area,
        cultivoActual: parsed.data.cultivoActual,
        secuenciaActual: parsed.data.secuenciaActual,
        tieneRiego: parsed.data.tieneRiego,
        altitudM: parsed.data.altitudM,
      });

      const enCache = cacheRef.current.get(claveCache);
      if (enCache) {
        setError(null);
        setCodigoError(null);
        setEntradaEnviada(parsed.data);
        setPerfil(enCache.perfil);
        setComparacion(enCache.comparacion);
        setFase(enCache.perfil.aptitud === "apto" && enCache.comparacion ? "listo" : "no_apto");
        return;
      }

      const id = ++peticionRef.current;
      setError(null);
      setCodigoError(null);
      setPerfil(null);
      setComparacion(null);
      setEntradaEnviada(parsed.data);
      setFase("terreno");

      // Disparamos terreno y comparación en paralelo (el backend deduplica las consultas en vuelo)
      const promesaTerreno = explorarApi.analizarTerreno({ area });
      const promesaComparar = explorarApi.comparar(parsed.data);

      const resT = await promesaTerreno;
      if (id !== peticionRef.current) return;
      if (!resT.ok) {
        setError(resT.error.message);
        setCodigoError(resT.error.code);
        setFase("error");
        return;
      }
      setPerfil(resT.data);
      if (resT.data.aptitud !== "apto") {
        cacheRef.current.set(claveCache, { perfil: resT.data, comparacion: null });
        setFase("no_apto");
        return;
      }

      setFase("clima");
      const resC = await promesaComparar;
      if (id !== peticionRef.current) return;
      if (!resC.ok) {
        setError(resC.error.message);
        setCodigoError(resC.error.code);
        setFase(resC.error.code === "TERRENO_NO_APTO" ? "no_apto" : "error");
        return;
      }

      cacheRef.current.set(claveCache, { perfil: resT.data, comparacion: resC.data });
      setComparacion(resC.data);
      setFase("listo");
    },
    [area, objetivo],
  );

  const recomendacion = useMemo(() => {
    if (!comparacion) return null;
    return resolverRecomendacionPorObjetivoYEpoca(comparacion, objetivo, epoca);
  }, [comparacion, objetivo, epoca]);

  const fuentesEtapa = fase === "clima" ? FUENTES_CLIMA : FUENTES_TERRENO;
  const fuenteActual = cargando ? fuentesEtapa[Math.floor(segundos / 3) % fuentesEtapa.length] : null;

  return {
    area,
    setArea,
    objetivo,
    setObjetivo,
    epoca,
    setEpoca,
    fase,
    cargando,
    perfil,
    comparacion,
    recomendacion,
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
