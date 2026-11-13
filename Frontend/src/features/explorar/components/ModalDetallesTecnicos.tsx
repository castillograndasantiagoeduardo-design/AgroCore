"use client";

/**
 * Modal / Panel lateral de Divulgación Progresiva ("Ver detalles técnicos"):
 * Despliega bajo demanda los datos profundos (comparación de las 4 estrategias, ficha de suelo/terreno,
 * reglas agronómicas, oportunidades y fuentes satelitales) manteniendo limpia la vista principal.
 */
import { useEffect, useState } from "react";
import type { ComparacionRotacionesDto, IdEstrategia, PerfilTerrenoDto } from "@agrocore/contracts";
import { IconoCerrar } from "@/components/ui/Iconos";
import { FichaTerreno } from "./FichaTerreno";
import { FuentesYVacios } from "./FuentesYVacios";
import { ListaOportunidades } from "./ListaOportunidades";
import { TablaEstrategias } from "./TablaEstrategias";
import { TarjetaEstrategiaGlobal } from "./TarjetaEstrategiaGlobal";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  perfil: PerfilTerrenoDto | null;
  comparacion: ComparacionRotacionesDto;
  estrategiaDestacadaId: IdEstrategia;
}

type SeccionModal = "estrategias" | "terreno" | "fuentes";

export function ModalDetallesTecnicos({
  abierto,
  onCerrar,
  perfil,
  comparacion,
  estrategiaDestacadaId,
}: Props) {
  const [seccion, setSeccion] = useState<SeccionModal>("estrategias");

  useEffect(() => {
    if (!abierto) return;
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-detalles"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 id="titulo-modal-detalles" className="text-lg font-bold text-slate-900">
              Detalles técnicos e informe agronómico
            </h2>
            <p className="text-xs text-slate-500">
              Clima {comparacion.sitio.clasificacionClimatica} · Lluvia anual {Math.round(comparacion.clima.lluviaAnualMm)} mm · ET0{" "}
              {Math.round(comparacion.clima.etoAnualMm)} mm · Régimen {comparacion.clima.regimenLluvias}
            </p>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar detalles técnicos"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            <IconoCerrar width={15} height={15} />
            <span>Cerrar</span>
          </button>
        </div>

        {/* Pestañas de navegación interna */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-6 py-2.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSeccion("estrategias")}
            className={`rounded-lg px-3.5 py-1.5 transition-colors ${
              seccion === "estrategias" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Comparativa de estrategias ({comparacion.estrategias.length})
          </button>
          <button
            type="button"
            onClick={() => setSeccion("terreno")}
            className={`rounded-lg px-3.5 py-1.5 transition-colors ${
              seccion === "terreno" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Suelo, relieve y oportunidades
          </button>
          <button
            type="button"
            onClick={() => setSeccion("fuentes")}
            className={`rounded-lg px-3.5 py-1.5 transition-colors ${
              seccion === "fuentes" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Fuentes satelitales y notas
          </button>
        </div>

        {/* Cuerpo desplazable */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {seccion === "estrategias" && (
            <>
              <TablaEstrategias comparacion={comparacion} estrategiaDestacadaId={estrategiaDestacadaId} />
              <div className="grid gap-4 lg:grid-cols-2">
                {comparacion.estrategias.map((e) => (
                  <TarjetaEstrategiaGlobal key={e.id} estrategia={e} mejor={e.id === estrategiaDestacadaId} />
                ))}
              </div>
            </>
          )}

          {seccion === "terreno" && (
            <>
              {perfil && <FichaTerreno perfil={perfil} />}
              <ListaOportunidades oportunidades={comparacion.oportunidades} />
            </>
          )}

          {seccion === "fuentes" && <FuentesYVacios perfil={perfil} comparacion={comparacion} />}
        </div>
      </div>
    </div>
  );
}

