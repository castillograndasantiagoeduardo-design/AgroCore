"use client";

/**
 * Botón + formulario mínimo para guardar el sitio analizado como finca.
 */
import { useState, type FormEvent } from "react";
import type { AreaSeleccionadaDto, CrearFincaInput, ComparacionRotacionesDto } from "@agrocore/contracts";
import { explorarApi } from "../api/explorar.api";

interface Props {
  comparacion: ComparacionRotacionesDto;
  area: AreaSeleccionadaDto | null;
}

export function GuardarComoFinca({ comparacion, area }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardada, setGuardada] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const { ubicacion, tieneRiego, cultivoActual } = comparacion.sitio;
    const input: CrearFincaInput = {
      nombre: nombre.trim(),
      latitud: ubicacion.latitud,
      longitud: ubicacion.longitud,
      tieneRiego,
      cultivoActual,
      ...(area?.tipo === "poligono" ? { area: area.geojson } : {}),
    };
    setGuardando(true);
    setError(null);
    const res = await explorarApi.guardarFinca(input);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setGuardada(res.data.nombre);
    setAbierto(false);
  }

  if (guardada) {
    return <p role="status" className="text-sm font-medium text-emerald-800">✅ Finca «{guardada}» guardada. La verás en la sección Fincas.</p>;
  }

  return (
    <div className="space-y-2">
      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100">
          💾 Guardar como finca
        </button>
      ) : (
        <form onSubmit={guardar} className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="nombre-finca" className="block text-xs font-semibold text-slate-700">Nombre de la finca</label>
            <input
              id="nombre-finca"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              minLength={2}
              maxLength={120}
              required
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button type="submit" disabled={guardando || nombre.trim().length < 2} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" onClick={() => setAbierto(false)} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
