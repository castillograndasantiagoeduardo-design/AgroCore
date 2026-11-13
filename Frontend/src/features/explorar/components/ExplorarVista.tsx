"use client";

/**
 * Vista principal directa de Recomendación Agrícola:
 * - Flujo directo sin gestión de fincas.
 * - Selección de punto/polígono o ubicaciones rápidas + objetivo principal y época del año.
 * - Divulgación progresiva: recomendación accionable y calendario descriptivo en la vista principal,
 *   con acceso bajo demanda al modal de detalles técnicos.
 */
import { useMemo, useState } from "react";
import { IconoPin } from "@/components/ui/Iconos";
import { SelectorMapa } from "@/features/mapa/components/SelectorMapa";
import { useExplorar } from "../hooks/use-explorar";
import { UBICACIONES_RAPIDAS } from "../types/explorar.types";
import { BannerAptitud } from "./BannerAptitud";
import { CalendarioLote } from "./CalendarioLote";
import { FormularioSitio } from "./FormularioSitio";
import { ModalDetallesTecnicos } from "./ModalDetallesTecnicos";
import { TarjetaRecomendacionPrincipal } from "./TarjetaRecomendacionPrincipal";

export function ExplorarVista() {
  const x = useExplorar();
  const { perfil, comparacion, recomendacion } = x;
  const [detallesAbiertos, setDetallesAbiertos] = useState(false);

  const resaltado = useMemo(
    () =>
      perfil && perfil.aptitud === "no_apto_carretera" && perfil.viasCercanas.length > 0
        ? { lineas: perfil.viasCercanas.map((v) => v.geometria as [number, number][]), color: "#dc2626" }
        : null,
    [perfil],
  );

  const mensajeCarga =
    x.fase === "terreno"
      ? "Verificando aptitud del terreno, relieve SRTM y suelo..."
      : x.fase === "clima"
        ? "Calculando recomendación por época y objetivo con historial climático NASA POWER..."
        : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Recomendación agrícola por época y objetivo
          </h1>
          <p className="text-sm text-slate-600">
            Selecciona tu terreno en el mapa, elige tu objetivo principal y obtén al instante qué sembrar, cuándo hacerlo y el calendario mes a mes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-slate-500">Ubicaciones rápidas:</span>
          {UBICACIONES_RAPIDAS.map((u) => (
            <button
              key={u.nombre}
              type="button"
              onClick={() => x.setArea(u.area)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-600 hover:bg-emerald-50/50 hover:text-emerald-900"
            >
              <IconoPin width={13} height={13} className="text-emerald-700" />
              <span>{u.nombre}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7 xl:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Paso 1</span>
              <h2 className="text-lg font-bold text-slate-900">Selecciona la ubicación del lote</h2>
              <p className="text-xs text-slate-500">Haz clic sobre tu terreno o dibuja un polígono de hasta 100 ha</p>
            </div>
          </div>
          <SelectorMapa valor={x.area} onCambio={x.setArea} altura="500px" resaltado={resaltado} />
        </div>

        <div className="lg:col-span-5 xl:col-span-5">
          <FormularioSitio
            cultivos={x.cultivos}
            errorCultivos={x.errorCultivos}
            cargando={x.cargando}
            puedeAnalizar={x.area !== null}
            objetivo={x.objetivo}
            epoca={x.epoca}
            onCambioObjetivo={x.setObjetivo}
            onCambioEpoca={x.setEpoca}
            onAnalizar={x.analizar}
          />
        </div>
      </div>

      {/* Estado de carga con Skeleton limpio (sin barras de progreso ni emojis) */}
      <div aria-live="polite" className="space-y-3">
        {mensajeCarga && (
          <div role="status" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-3 text-sm text-slate-800">
              <span
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-slate-900">{mensajeCarga}</p>
                {x.fuenteActual && <p className="text-xs text-slate-500">Fuente activa: {x.fuenteActual}</p>}
              </div>
            </div>
            <div className="grid gap-3 pt-1 sm:grid-cols-3" aria-hidden="true">
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
            </div>
          </div>
        )}

        {x.error && (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {x.error}
          </p>
        )}
      </div>

      {perfil && <BannerAptitud perfil={perfil} />}

      {/* Vista resumida accionable + Calendario agrícola descriptivo */}
      {comparacion && recomendacion && (
        <div className="space-y-6">
          <TarjetaRecomendacionPrincipal
            recomendacion={recomendacion}
            comparacion={comparacion}
            perfil={perfil}
            entrada={x.entradaEnviada}
            objetivo={x.objetivo}
            epoca={x.epoca}
            onCambioObjetivo={x.setObjetivo}
            onCambioEpoca={x.setEpoca}
            onAbrirDetalles={() => setDetallesAbiertos(true)}
          />

          <CalendarioLote
            calendario={comparacion.calendario}
            estrategia={recomendacion.estrategia}
            objetivoNombre={recomendacion.objetivo.nombre}
          />

          <ModalDetallesTecnicos
            abierto={detallesAbiertos}
            onCerrar={() => setDetallesAbiertos(false)}
            perfil={perfil}
            comparacion={comparacion}
            estrategiaDestacadaId={recomendacion.estrategia.id}
          />
        </div>
      )}
    </section>
  );
}
