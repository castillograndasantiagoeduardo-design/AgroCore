"use client";

/**
 * Botón "Imprimir ticket": envía el ticket a la impresora térmica por la API o, si no hay impresora,
 * ofrece imprimir desde el navegador (window.print) con el ticket de 58 mm.
 */
import { useState } from "react";
import type {
  ComparacionRotacionesDto,
  CompararRotacionesUbicacionInput,
  LineaTicketDto,
  PerfilTerrenoDto,
} from "@agrocore/contracts";
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
    const res = await impresionApi.imprimirTerreno({ ...entrada, soloVistaPrevia: false });
    setEnviando(false);
    if (res.ok) {
      setLineas(res.data.lineas);
      setMensaje(`Ticket enviado a ${res.data.impresora ?? "la impresora"}`);
      return;
    }
    if (res.error.code === "IMPRESORA_NO_DISPONIBLE") {
      setSinImpresora(true);
      setError("No hay impresora térmica disponible.");
    } else {
      setError(res.error.message);
    }
  }

  async function imprimirDesdeNavegador() {
    if (!entrada) return;
    setEnviando(true);
    const res = await impresionApi.imprimirTerreno({ ...entrada, soloVistaPrevia: true });
    setEnviando(false);
    setLineas(res.ok ? res.data.lineas : componerTicketLocal(comparacion, perfil));
    // Espera a que React pinte el ticket antes de abrir el diálogo de impresión.
    setTimeout(() => window.print(), 100);
  }

  return (
    <div className="space-y-2">
      <div className="no-imprimir flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={imprimir}
          disabled={enviando || !entrada}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "🖨️ Imprimir ticket"}
        </button>
        {sinImpresora && (
          <button
            type="button"
            onClick={imprimirDesdeNavegador}
            disabled={enviando}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            Imprimir desde el navegador
          </button>
        )}
        <span aria-live="polite" className="text-sm">
          {mensaje && <span className="font-medium text-emerald-800">{mensaje}</span>}
          {error && <span className="text-red-600">{error}</span>}
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
