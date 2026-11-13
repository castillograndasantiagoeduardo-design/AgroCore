"use client";

/**
 * Vista del módulo rotaciones: finca + prioridades → comparación de 3 estrategias a 2 años.
 */
import { type FormEvent, useEffect, useState } from "react";
import { PRIORIDADES_ROTACION, type PrioridadesRotacion } from "@agrocore/contracts";
import { fincasApi } from "@/features/fincas/api/fincas.api";
import type { PaginaFincas } from "@/features/fincas/types/fincas.types";
import { useComparacionRotaciones } from "../hooks/use-comparacion-rotaciones";
import { ETIQUETA_PRIORIDAD } from "../types/rotaciones.types";
import { ResumenFincaClima } from "./ResumenFincaClima";
import { TablaComparativa } from "./TablaComparativa";
import { TarjetaEstrategia } from "./TarjetaEstrategia";

const PRIORIDADES_INICIALES: PrioridadesRotacion = { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 };

const PRESETS_PRIORIDADES = [
  {
    id: "agua",
    icono: "💧",
    nombre: "Ahorrar Agua",
    descripcion: "Bajo consumo y resistencia a déficit hídrico",
    valores: { agua: 5, suelo: 3, plagas: 3, forraje: 1, ingreso: 1 },
  },
  {
    id: "ingreso",
    icono: "💰",
    nombre: "Mejor para Vender",
    descripcion: "Maximiza ingresos comerciales de mercado",
    valores: { agua: 3, suelo: 2, plagas: 4, forraje: 1, ingreso: 5 },
  },
  {
    id: "suelo",
    icono: "🌱",
    nombre: "Cuidar el Suelo",
    descripcion: "Fijación biológica de nitrógeno y cobertura",
    valores: { agua: 3, suelo: 5, plagas: 5, forraje: 2, ingreso: 2 },
  },
  {
    id: "plagas",
    icono: "🐛",
    nombre: "Control de Plagas",
    descripcion: "Ruptura estricta de ciclos de insectos/hongos",
    valores: { agua: 3, suelo: 4, plagas: 5, forraje: 2, ingreso: 2 },
  },
  {
    id: "forraje",
    icono: "🐄",
    nombre: "Forraje y Lechería",
    descripcion: "Mayor volumen de biomasa para ganado",
    valores: { agua: 2, suelo: 4, plagas: 3, forraje: 5, ingreso: 2 },
  },
  {
    id: "equilibrado",
    icono: "⚖️",
    nombre: "Equilibrado",
    descripcion: "Ponderación media uniforme (3 de 5)",
    valores: { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 },
  },
];

export function RotacionesVista() {
  const [fincas, setFincas] = useState<PaginaFincas | null>(null);
  const [cargandoFincas, setCargandoFincas] = useState(true);
  const [errorFincas, setErrorFincas] = useState<string | null>(null);
  const [fincaId, setFincaId] = useState("");
  const [prioridades, setPrioridades] = useState<PrioridadesRotacion>(PRIORIDADES_INICIALES);
  const [presetActivo, setPresetActivo] = useState<string | null>("equilibrado");
  const { comparacion, cargando, error, comparar } = useComparacionRotaciones();

  useEffect(() => {
    let activo = true;
    fincasApi.listar(1, 100).then((res) => {
      if (!activo) return;
      if (res.ok) {
        setFincas(res.data);
        if (res.data.items.length > 0) setFincaId(String(res.data.items[0].id));
      } else {
        setErrorFincas(res.error.message);
      }
      setCargandoFincas(false);
    });
    return () => {
      activo = false;
    };
  }, []);

  function aplicarPreset(preset: (typeof PRESETS_PRIORIDADES)[number]) {
    setPresetActivo(preset.id);
    setPrioridades(preset.valores);
    if (fincaId !== "") {
      comparar(Number(fincaId), preset.valores);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (fincaId === "") return;
    await comparar(Number(fincaId), prioridades);
  }

  const sinFincas = !cargandoFincas && !errorFincas && (fincas?.items.length ?? 0) === 0;

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Rotaciones de cultivos</h1>
        <p className="text-sm text-slate-600">
          Elige una finca y el objetivo prioritario para tu lote. El motor consultará la NASA y el IDEAM para comparar 3 estrategias.
        </p>
      </div>

      {cargandoFincas && <p className="text-sm text-slate-500">Cargando fincas…</p>}
      {errorFincas && <p className="text-sm text-red-600">{errorFincas}</p>}
      {sinFincas && <p className="text-sm">Aún no hay fincas registradas. Registra una en la sección Fincas.</p>}

      {fincas && fincas.items.length > 0 && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label htmlFor="finca" className="block text-sm font-semibold text-slate-800">
              1. Selecciona la finca
            </label>
            <select
              id="finca"
              value={fincaId}
              onChange={(e) => setFincaId(e.target.value)}
              className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm font-medium w-full max-w-md"
            >
              {fincas.items.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre} ({f.altitudM ? `${f.altitudM} m` : "Altitud satelital"} · {f.cultivoActual ? `Cultivo: ${f.cultivoActual}` : "Sin cultivo previo"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              2. ¿Cuál es tu objetivo principal? (Acceso rápido)
            </label>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {PRESETS_PRIORIDADES.map((p) => {
                const activo = presetActivo === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => aplicarPreset(p)}
                    className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                      activo
                        ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold shadow-sm ring-2 ring-emerald-500/20"
                        : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <span className="text-2xl mb-1">{p.icono}</span>
                    <span className="text-xs font-semibold leading-tight">{p.nombre}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">
              O personaliza los pesos manualmente (0 a 5):
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
              {PRIORIDADES_ROTACION.map((p) => (
                <div key={p} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700">{ETIQUETA_PRIORIDAD[p]}</span>
                    <span className="font-bold text-slate-900">{prioridades[p]} / 5</span>
                  </div>
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
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={cargando || fincaId === ""}
              className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              {cargando ? "Calculando con datos NASA…" : "Comparar rotaciones recomendadas"}
            </button>
          </div>
        </form>
      )}

      {cargando && (
        <p role="status" className="text-sm text-slate-600">
          Calculando… La primera consulta de una finca puede tardar cerca de 45 segundos porque se descarga y analiza el
          clima de los últimos 30 años. Las siguientes serán mucho más rápidas.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {comparacion && (
        <div className="space-y-4">
          <ResumenFincaClima comparacion={comparacion} />
          <TablaComparativa comparacion={comparacion} />

          <div className="grid gap-4 lg:grid-cols-3">
            {comparacion.estrategias.map((e) => (
              <TarjetaEstrategia key={e.id} estrategia={e} mejor={e.id === comparacion.estrategiaMejorPuntuada} />
            ))}
          </div>

          {comparacion.advertencias.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <h2 className="font-semibold">Advertencias</h2>
              <ul className="list-disc pl-5">
                {comparacion.advertencias.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">
        {comparacion?.aviso ??
          "Este sistema sugiere y explica con datos; no reemplaza el criterio del agricultor ni del agrónomo."}
      </p>
    </section>
  );
}
