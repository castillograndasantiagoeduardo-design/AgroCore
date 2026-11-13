"use client";

/**
 * Formulario del sitio: cultivo actual, riego, prioridades (con presets), altitud y secuencia actual.
 */
import { useMemo, useState, type FormEvent } from "react";
import { PRIORIDADES_ROTACION, type CultivoDto, type PrioridadesRotacion } from "@agrocore/contracts";
import { ETIQUETA_PRIORIDAD, PRESETS_PRIORIDADES, type EntradaSitio } from "../types/explorar.types";

interface Props {
  cultivos: CultivoDto[];
  errorCultivos: string | null;
  cargando: boolean;
  puedeAnalizar: boolean;
  onAnalizar: (entrada: EntradaSitio) => void;
}

const MAX_SECUENCIA = 4;

export function FormularioSitio({ cultivos, errorCultivos, cargando, puedeAnalizar, onAnalizar }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [cultivoElegido, setCultivoElegido] = useState("");
  const [tieneRiego, setTieneRiego] = useState(false);
  const [prioridades, setPrioridades] = useState<PrioridadesRotacion>(PRESETS_PRIORIDADES[0].valores);
  const [presetActivo, setPresetActivo] = useState<string | null>("equilibrado");
  const [altitud, setAltitud] = useState("");
  const [secuencia, setSecuencia] = useState<string[]>([]);

  const cultivoActual = cultivoElegido || (cultivos.find((c) => c.clave === "papa") ?? cultivos[0])?.clave || "";

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cultivos;
    const lista = cultivos.filter((c) => c.nombre.toLowerCase().includes(q) || c.clave.includes(q));
    // El elegido siempre queda visible para que el select no quede en blanco.
    const elegido = cultivos.find((c) => c.clave === cultivoActual);
    return elegido && !lista.includes(elegido) ? [elegido, ...lista] : lista;
  }, [cultivos, busqueda, cultivoActual]);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!cultivoActual) return;
    const alt = altitud.trim() === "" ? undefined : Math.round(Number(altitud));
    onAnalizar({
      cultivoActual,
      secuenciaActual: secuencia.filter(Boolean).length > 0 ? secuencia.filter(Boolean) : undefined,
      tieneRiego,
      prioridades,
      altitudM: alt !== undefined && Number.isFinite(alt) ? alt : undefined,
    });
  }

  const campo = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">2. Cuéntanos del lote</h2>
      {errorCultivos && <p role="alert" className="text-xs text-red-600">No se pudo cargar el catálogo de cultivos: {errorCultivos}</p>}

      <div className="space-y-1">
        <label htmlFor="buscar-cultivo" className="block text-sm font-semibold text-slate-800">
          Cultivo actual
        </label>
        <input
          id="buscar-cultivo"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre…"
          className={campo}
        />
        <select
          id="cultivo-actual"
          aria-label="Cultivo actual"
          value={cultivoActual}
          onChange={(e) => setCultivoElegido(e.target.value)}
          className={campo}
          disabled={cultivos.length === 0}
        >
          {cultivos.length === 0 && <option value="">Cargando catálogo…</option>}
          {filtrados.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input type="checkbox" checked={tieneRiego} onChange={(e) => setTieneRiego(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
        ¿Tiene riego?
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800">¿Qué es lo más importante? (0 a 5)</legend>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS_PRIORIDADES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={presetActivo === p.id}
              onClick={() => {
                setPresetActivo(p.id);
                setPrioridades(p.valores);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                presetActivo === p.id ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {p.nombre}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRIORIDADES_ROTACION.map((p) => (
            <div key={p} className="space-y-0.5">
              <label htmlFor={"prioridad-" + p} className="flex justify-between text-xs">
                <span className="font-medium text-slate-700">{ETIQUETA_PRIORIDAD[p]}</span>
                <span className="font-bold text-slate-900">{prioridades[p]} / 5</span>
              </label>
              <input
                id={"prioridad-" + p}
                type="range"
                min={0}
                max={5}
                step={1}
                value={prioridades[p]}
                onChange={(e) => {
                  setPresetActivo(null);
                  setPrioridades((x) => ({ ...x, [p]: Number(e.target.value) }));
                }}
                className="w-full accent-slate-800"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="altitud" className="block text-sm font-semibold text-slate-800">
          Altitud en metros <span className="font-normal text-slate-500">(opcional; si no, se estima con SRTM)</span>
        </label>
        <input id="altitud" type="number" min={-500} max={6000} step={1} value={altitud} onChange={(e) => setAltitud(e.target.value)} className={campo + " max-w-40"} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-semibold text-slate-800">
          Secuencia actual <span className="font-normal text-slate-500">(opcional, hasta {MAX_SECUENCIA} cultivos)</span>
        </legend>
        {secuencia.map((clave, i) => (
          <div key={i} className="flex gap-1.5">
            <select
              aria-label={"Cultivo " + (i + 1) + " de la secuencia"}
              value={clave}
              onChange={(e) => setSecuencia((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
              className={campo}
            >
              {cultivos.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {i + 1}. {c.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={"Quitar cultivo " + (i + 1)}
              onClick={() => setSecuencia((s) => s.filter((_, j) => j !== i))}
              className="rounded border border-red-300 px-2 text-xs text-red-700"
            >
              ✕
            </button>
          </div>
        ))}
        {secuencia.length < MAX_SECUENCIA && cultivos.length > 0 && (
          <button
            type="button"
            onClick={() => setSecuencia((s) => [...s, cultivoActual || cultivos[0].clave])}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-100"
          >
            + Agregar cultivo a la secuencia
          </button>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={cargando || !puedeAnalizar || !cultivoActual}
        className="w-full rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
      >
        {cargando ? "Analizando…" : puedeAnalizar ? "Analizar este lugar" : "Primero marca un punto o un área en el mapa"}
      </button>
    </form>
  );
}
