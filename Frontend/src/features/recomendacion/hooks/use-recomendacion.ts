"use client";
/**
 * Hook principal de la recomendación por época.
 *
 * - Una sola petición viva: cambiar de punto CANCELA la anterior (AbortController) y los eventos tardíos se ignoran.
 * - Debounce de 400 ms en los clics seguidos.
 * - Vigilante de 30 s: "Esto está tardando más de lo normal" (Seguir esperando / Cancelar). Nunca un spinner infinito:
 *   la máquina de estados (estado-carga.ts) siempre termina en completo, parcial o error con "Reintentar".
 * - Cambiar de objetivo es local (la etapa rápida trae los 4): no hace otra petición.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { AreaSeleccionadaDto, Objetivo } from "@agrocore/contracts";
import { flujo, precargar as precargarApi } from "../api/recomendacion.api";
import { ESTADO_INICIAL, estaCargando, reducirCarga, VIGILANTE_MS } from "../estado-carga";

export const DEBOUNCE_MS = 400;

export function useRecomendacion() {
  const [estado, despachar] = useReducer(reducirCarga, ESTADO_INICIAL);
  const [area, setArea] = useState<AreaSeleccionadaDto | null>(null);
  const [objetivo, setObjetivo] = useState<Objetivo>("equilibrado");
  const [cultivoActual, setCultivoActual] = useState<string | undefined>(undefined);
  const [tieneRiego, setTieneRiego] = useState(false);
  const control = useRef<AbortController | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vigilante = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idActual = useRef(0);
  const cancelarPrecarga = useRef<(() => void) | null>(null);

  const limpiarTemporizadores = () => {
    if (espera.current) clearTimeout(espera.current);
    if (vigilante.current) clearTimeout(vigilante.current);
    espera.current = null;
    vigilante.current = null;
  };

  const armarVigilante = useCallback((id: number) => {
    if (vigilante.current) clearTimeout(vigilante.current);
    vigilante.current = setTimeout(() => despachar({ tipo: "vigilante", id }), VIGILANTE_MS);
  }, []);

  const ejecutar = useCallback(async (nueva: AreaSeleccionadaDto, extra: { cultivoActual?: string; tieneRiego: boolean }) => {
    control.current?.abort();
    cancelarPrecarga.current?.();
    const c = new AbortController();
    control.current = c;
    const id = ++idActual.current;
    despachar({ tipo: "iniciar", id });
    armarVigilante(id);
    try {
      await flujo({ area: nueva, cultivoActual: extra.cultivoActual, tieneRiego: extra.tieneRiego, objetivo: "equilibrado" }, (evento) => despachar({ tipo: "evento", id, evento }), c.signal);
      despachar({ tipo: "cerrado", id });
    } catch (e) {
      if (c.signal.aborted) return; // cancelada a propósito: el estado ya se limpió
      despachar({ tipo: "fallo_red", id, mensaje: e instanceof Error && e.message ? "No se pudo conectar con el servidor (" + e.message + ")." : "No se pudo conectar con el servidor." });
    } finally {
      if (idActual.current === id && vigilante.current) clearTimeout(vigilante.current);
    }
  }, [armarVigilante]);

  /** Elegir un área (clic o dibujo): espera DEBOUNCE_MS por si llega otro clic y entonces consulta. */
  const seleccionar = useCallback((nueva: AreaSeleccionadaDto | null) => {
    setArea(nueva);
    limpiarTemporizadores();
    control.current?.abort();
    if (!nueva) {
      despachar({ tipo: "cancelar" });
      return;
    }
    espera.current = setTimeout(() => void ejecutar(nueva, { cultivoActual, tieneRiego }), DEBOUNCE_MS);
  }, [ejecutar, cultivoActual, tieneRiego]);

  const reintentar = useCallback(() => {
    if (area) void ejecutar(area, { cultivoActual, tieneRiego });
  }, [area, ejecutar, cultivoActual, tieneRiego]);

  const cancelar = useCallback(() => {
    limpiarTemporizadores();
    control.current?.abort();
    despachar({ tipo: "cancelar" });
  }, []);

  /** Borrar selección: quita el área, cancela la petición y limpia el resultado. */
  const borrar = useCallback(() => {
    setArea(null);
    cancelar();
  }, [cancelar]);

  const seguirEsperando = useCallback(() => {
    despachar({ tipo: "seguir_esperando", id: idActual.current });
    armarVigilante(idActual.current);
  }, [armarVigilante]);

  /** Precarga la celda bajo el cursor o el centro del mapa (no cambia la pantalla). */
  const precargar = useCallback((lat: number, lon: number) => {
    cancelarPrecarga.current?.();
    cancelarPrecarga.current = precargarApi({ area: { tipo: "punto", latitud: lat, longitud: lon }, tieneRiego, objetivo: "equilibrado" });
  }, [tieneRiego]);

  /** Cambiar cultivo actual o riego vuelve a consultar el área actual. */
  const cambiarContexto = useCallback((c: { cultivoActual?: string; tieneRiego?: boolean }) => {
    const nuevoCultivo = "cultivoActual" in c ? c.cultivoActual : cultivoActual;
    const nuevoRiego = c.tieneRiego ?? tieneRiego;
    setCultivoActual(nuevoCultivo);
    setTieneRiego(nuevoRiego);
    if (area) void ejecutar(area, { cultivoActual: nuevoCultivo, tieneRiego: nuevoRiego });
  }, [area, cultivoActual, tieneRiego, ejecutar]);

  useEffect(() => () => {
    limpiarTemporizadores();
    control.current?.abort();
    cancelarPrecarga.current?.();
  }, []);

  return {
    estado,
    cargando: estaCargando(estado),
    area,
    objetivo,
    setObjetivo,
    cultivoActual,
    tieneRiego,
    seleccionar,
    reintentar,
    cancelar,
    borrar,
    seguirEsperando,
    precargar,
    cambiarContexto,
  };
}
