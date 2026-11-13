"use client";

/**
 * Botón "Imprimir resumen" con iconografía vectorial (sin emojis).
 */
import { useState } from "react";
import type {
  ComparacionRotacionesDto,
  CompararRotacionesUbicacionInput,
  LineaTicketDto,
  PerfilTerrenoDto,
} from "@agrocore/contracts";
import { IconoImpresora } from "@/components/ui/Iconos";
import { impresionApi } from "../api/impresion.api";
import { TicketImprimible, componerTicketLocal } from "./TicketImprimible";

interface Props {
  entrada: CompararRotacionesUbicacionInput | null;
  comparacion: ComparacionRotacionesDto | null;
  perfil: PerfilTerrenoDto | null;
}

export function BotonImprimirTicket({ entrada, comparacion, perfil }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinImpresora, setSinImpresora] = useState(false);
  const [lineas, setLineas] = useState<LineaTicketDto[] | null>(null);

  async function imprimir() {
    if (!entrada) return;
    setEnviando(true);
    setMensaje(null);
    setError(null);
    setSinImpresora(false);
    const res = await impresionApi.imprimirTerreno({ area: entrada.area, cultivoActual: entrada.cultivoActual, tieneRiego: entrada.tieneRiego, objetivo: "equilibrado", soloVistaPrevia: false });
    setEnviando(false);
    if (res.ok) {
      setLineas(res.data.lineas);
      setMensaje(`Resumen enviado a ${res.data.impresora ?? "la impresora"}`);
      return;
    }
    if (res.error.code === "IMPRESORA_NO_DISPONIBLE") {
      setSinImpresora(true);
      setError("Impresora térmica no detectada.");
    } else {
      setError(res.error.message);
    }
  }

  async function imprimirDesdeNavegador() {
    if (!entrada) return;
    setEnviando(true);
    const res = await impresionApi.imprimirTerreno({ area: entrada.area, cultivoActual: entrada.cultivoActual, tieneRiego: entrada.tieneRiego, objetivo: "equilibrado", soloVistaPrevia: true });
    setEnviando(false);
    setLineas(res.ok ? res.data.lineas : componerTicketLocal(comparacion, perfil));
    setTimeout(() => window.print(), 100);
  }

  return (
    <div className="space-y-2">
      <div className="no-imprimir flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={imprimir}
          disabled={enviando || !entrada}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          <IconoImpresora width={15} height={15} />
          <span>{enviando ? "Enviando..." : "Imprimir ticket"}</span>
        </button>
        {sinImpresora && (
          <button
            type="button"
            onClick={imprimirDesdeNavegador}
            disabled={enviando}
            className="rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            Imprimir desde navegador
          </button>
        )}
        <span aria-live="polite" className="text-xs">
          {mensaje && <span className="font-medium text-emerald-800">{mensaje}</span>}
          {error && <span className="text-amber-800">{error}</span>}
        </span>
      </div>
      {lineas && (
        <div className="no-imprimir-titulo text-xs text-slate-500">
          Vista previa del ticket (58 mm):
        </div>
      )}
      {lineas && <TicketImprimible lineas={lineas} />}
    </div>
  );
}
