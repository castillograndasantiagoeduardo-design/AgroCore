"use client";

/**
 * Vista principal resumida (Divulgación Progresiva / Progressive Disclosure):
 * Muestra únicamente la información esencial y accionable:
 * - Qué sembrar exactamente según el objetivo y la época del año.
 * - Cuándo sembrar y cosechar.
 * - Beneficio clave y razón agronómica en lenguaje claro.
 * - Botón "Ver detalles técnicos" para abrir el panel profundo bajo demanda.
 */
import type {
  ComparacionRotacionesDto,
  CompararRotacionesUbicacionInput,
  PerfilTerrenoDto,
} from "@agrocore/contracts";
import {
  IconoAgua,
  IconoCalendario,
  IconoCheck,
  IconoEquilibrio,
  IconoFlechaDerecha,
  IconoHoja,
  IconoInfo,
  IconoIngreso,
  IconoSuelo,
} from "@/components/ui/Iconos";
import { BotonImprimirTicket } from "@/features/impresion/components/BotonImprimirTicket";
import {
  EPOCAS_ANIO,
  OBJETIVOS_PRINCIPALES,
  mesCorto,
  type EpocaConsulta,
  type ObjetivoPrincipal,
  type RecomendacionAccionable,
} from "../types/explorar.types";
import type { ReactNode } from "react";

interface Props {
  recomendacion: RecomendacionAccionable;
  comparacion: ComparacionRotacionesDto;
  perfil: PerfilTerrenoDto | null;
  entrada: CompararRotacionesUbicacionInput | null;
  objetivo: ObjetivoPrincipal;
  epoca: EpocaConsulta;
  onCambioObjetivo: (objetivo: ObjetivoPrincipal) => void;
  onCambioEpoca: (epoca: EpocaConsulta) => void;
  onAbrirDetalles: () => void;
}

const ICONO_OBJ: Record<ObjetivoPrincipal, ReactNode> = {
  equilibrado: <IconoEquilibrio width={15} height={15} />,
  suelo: <IconoSuelo width={15} height={15} />,
  agua: <IconoAgua width={15} height={15} />,
  ingreso: <IconoIngreso width={15} height={15} />,
};

export function TarjetaRecomendacionPrincipal({
  recomendacion,
  comparacion,
  perfil,
  entrada,
  objetivo,
  epoca,
  onCambioObjetivo,
  onCambioEpoca,
  onAbrirDetalles,
}: Props) {
  const { pasoRecomendado, pasosSecuencia, estrategia } = recomendacion;

  return (
    <section
      aria-labelledby="titulo-recomendacion"
      className="space-y-5 rounded-2xl border border-emerald-200 bg-white p-6 shadow-xs"
    >
      {/* Selector rápido en vivo de Objetivo y Época (cambio instantáneo sin recargar) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cambiar objetivo principal">
          {OBJETIVOS_PRINCIPALES.map((op) => {
            const activo = objetivo === op.id;
            return (
              <button
                key={op.id}
                type="button"
                aria-pressed={activo}
                onClick={() => onCambioObjetivo(op.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activo
                    ? "bg-emerald-700 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {ICONO_OBJ[op.id]}
                <span>{op.nombre}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cambiar época del año">
          {EPOCAS_ANIO.map((ep) => {
            const activa = epoca === ep.id;
            return (
              <button
                key={ep.id}
                type="button"
                aria-pressed={activa}
                onClick={() => onCambioEpoca(ep.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  activa
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {ep.nombre}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bloque principal: Qué sembrar, cuándo y por qué */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <IconoHoja width={14} height={14} />
            <span>Recomendación principal · Objetivo: {recomendacion.objetivo.nombre}</span>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Qué sembrar en esta época</p>
            <h2 id="titulo-recomendacion" className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {recomendacion.queSembrar}
            </h2>
          </div>

          <p className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-800">
            <IconoCalendario width={16} height={16} className="text-emerald-700" />
            <span>{recomendacion.cuandoSembrar}</span>
          </p>

          <div className="space-y-2 pt-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Por qué se recomienda y beneficio clave
            </h3>
            <p className="text-sm leading-relaxed text-slate-800">{recomendacion.beneficioClave}</p>
            <p className="text-xs leading-relaxed text-slate-600">{recomendacion.razonEpoca}</p>
          </div>

          <ul className="space-y-1.5 pt-1">
            {recomendacion.cuidadosClave.map((cuidado, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                <IconoCheck width={15} height={15} className="mt-0.5 shrink-0 text-emerald-700" />
                <span>{cuidado}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Columna derecha: Secuencia resumida de 2 años y métricas clave sin barras */}
        <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 lg:col-span-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Plan de rotación sugerido (2 años)
              </span>
              <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-emerald-800 shadow-2xs">
                Adecuación: {Math.round(estrategia.puntajeTotal)}/100
              </span>
            </div>

            <ol className="space-y-2" aria-label="Secuencia de rotación">
              {pasosSecuencia.map((p, idx) => {
                const esActual = p.orden === pasoRecomendado.orden;
                return (
                  <li
                    key={p.orden}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                      esActual
                        ? "border-emerald-500 bg-emerald-50/80 font-semibold text-slate-900"
                        : "border-slate-200/80 bg-white text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                          esActual ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span>{p.cultivoNombre}</span>
                    </div>
                    <span className="text-slate-500">
                      {mesCorto(p.mesSiembra)} <IconoFlechaDerecha width={12} height={12} className="inline" />{" "}
                      {mesCorto(p.mesCosecha)} (Año {p.anio})
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <dl className="grid grid-cols-3 gap-2 pt-2 text-center">
            <div className="rounded-xl bg-white p-2.5 shadow-2xs">
              <dt className="text-[11px] text-slate-500">Temp. ciclo</dt>
              <dd className="text-sm font-bold text-slate-900">{pasoRecomendado.tempMediaCicloC.toFixed(1)} °C</dd>
            </div>
            <div className="rounded-xl bg-white p-2.5 shadow-2xs">
              <dt className="text-[11px] text-slate-500">Lluvia ciclo</dt>
              <dd className="text-sm font-bold text-slate-900">{Math.round(pasoRecomendado.lluviaCicloMm)} mm</dd>
            </div>
            <div className="rounded-xl bg-white p-2.5 shadow-2xs">
              <dt className="text-[11px] text-slate-500">Altitud lote</dt>
              <dd className="text-sm font-bold text-slate-900">{Math.round(comparacion.sitio.altitudReferenciaM)} m</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Acciones: Botón de divulgación progresiva ("Ver detalles técnicos") + Impresión */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onAbrirDetalles}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
        >
          <IconoInfo width={16} height={16} />
          <span>Ver detalles técnicos y comparación completa</span>
        </button>

        <BotonImprimirTicket entrada={entrada} comparacion={comparacion} perfil={perfil} />
      </div>
    </section>
  );
}

