"use client";

/**
 * Panel de configuración directa:
 * 1. Selector interactivo de Objetivo Principal (Equilibrado, Mejorar el suelo, Ahorrar agua, Mayores ingresos).
 * 2. Selector de Época del año.
 * 3. Cultivo actual y disponibilidad de riego (sin barras de rango ni pasos innecesarios).
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { CultivoDto } from "@agrocore/contracts";
import {
  IconoAgua,
  IconoCalendario,
  IconoEquilibrio,
  IconoFlechaDerecha,
  IconoIngreso,
  IconoSuelo,
} from "@/components/ui/Iconos";
import {
  EPOCAS_ANIO,
  OBJETIVOS_PRINCIPALES,
  type EntradaSitio,
  type EpocaConsulta,
  type ObjetivoPrincipal,
} from "../types/explorar.types";

interface Props {
  cultivos: CultivoDto[];
  errorCultivos: string | null;
  cargando: boolean;
  puedeAnalizar: boolean;
  objetivo: ObjetivoPrincipal;
  epoca: EpocaConsulta;
  onCambioObjetivo: (objetivo: ObjetivoPrincipal) => void;
  onCambioEpoca: (epoca: EpocaConsulta) => void;
  onAnalizar: (entrada: EntradaSitio) => void;
}

const ICONO_OBJETIVO: Record<ObjetivoPrincipal, ReactNode> = {
  equilibrado: <IconoEquilibrio width={18} height={18} />,
  suelo: <IconoSuelo width={18} height={18} />,
  agua: <IconoAgua width={18} height={18} />,
  ingreso: <IconoIngreso width={18} height={18} />,
};

export function FormularioSitio({
  cultivos,
  errorCultivos,
  cargando,
  puedeAnalizar,
  objetivo,
  epoca,
  onCambioObjetivo,
  onCambioEpoca,
  onAnalizar,
}: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [cultivoElegido, setCultivoElegido] = useState("");
  const [tieneRiego, setTieneRiego] = useState(false);

  const cultivoActual = cultivoElegido || (cultivos.find((c) => c.clave === "papa") ?? cultivos[0])?.clave || "";

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cultivos;
    const lista = cultivos.filter((c) => c.nombre.toLowerCase().includes(q) || c.clave.includes(q));
    const elegido = cultivos.find((c) => c.clave === cultivoActual);
    return elegido && !lista.includes(elegido) ? [elegido, ...lista] : lista;
  }, [cultivos, busqueda, cultivoActual]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!cultivoActual) return;
    const defObj = OBJETIVOS_PRINCIPALES.find((o) => o.id === objetivo) ?? OBJETIVOS_PRINCIPALES[0];
    onAnalizar({
      cultivoActual,
      tieneRiego,
      prioridades: defObj.prioridades,
      objetivo,
      epoca,
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col justify-between space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="space-y-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Paso 2</span>
          <h2 className="text-lg font-bold text-slate-900">Define tu objetivo y época</h2>
          <p className="text-xs text-slate-500">
            Elige qué buscas priorizar en tu terreno; puedes cambiar el objetivo en cualquier momento.
          </p>
        </div>

        {errorCultivos && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            No se pudo cargar el catálogo de cultivos: {errorCultivos}
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Objetivo principal de la recomendación
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {OBJETIVOS_PRINCIPALES.map((op) => {
              const activo = objetivo === op.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onCambioObjetivo(op.id)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                    activo
                      ? "border-emerald-600 bg-emerald-50/70 text-slate-900 ring-1 ring-emerald-600"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      activo ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ICONO_OBJETIVO[op.id]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{op.nombre}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500">{op.resumenCorto}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <IconoCalendario width={14} height={14} /> Época de siembra a consultar
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {EPOCAS_ANIO.map((ep) => {
              const activa = epoca === ep.id;
              return (
                <button
                  key={ep.id}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => onCambioEpoca(ep.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    activa
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="block text-xs font-semibold">{ep.nombre}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="cultivo-actual" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Cultivo actual o anterior
            </label>
            <input
              id="buscar-cultivo"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtrar cultivo (ej. papa, maíz)..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
            <select
              id="cultivo-actual"
              aria-label="Cultivo actual"
              value={cultivoActual}
              onChange={(e) => setCultivoElegido(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
              disabled={cultivos.length === 0}
            >
              {cultivos.length === 0 && <option value="">Cargando catálogo...</option>}
              {filtrados.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Disponibilidad de agua
            </span>
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 transition-colors hover:bg-slate-100">
              <span className="text-sm font-medium text-slate-800">El lote cuenta con riego</span>
              <input
                type="checkbox"
                checked={tieneRiego}
                onChange={(e) => setTieneRiego(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-700"
              />
            </label>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={cargando || !puedeAnalizar || !cultivoActual}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-800 disabled:opacity-50"
      >
        <span>
          {cargando
            ? "Calculando recomendación..."
            : puedeAnalizar
              ? "Obtener recomendación agrícola"
              : "Selecciona un punto en el mapa"}
        </span>
        {!cargando && <IconoFlechaDerecha width={16} height={16} />}
      </button>
    </form>
  );
}
