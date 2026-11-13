/**
 * Tarjeta técnica de una estrategia: justificación, evidencia con fuente, beneficios, vacíos, riesgos y reglas (sin emojis).
 */
import type { EstrategiaRotacionDto, FuenteEvidencia } from "@agrocore/contracts";
import { IconoCheck, IconoCerrar } from "@/components/ui/Iconos";
import { ETIQUETA_REGLA } from "../types/explorar.types";

const COLOR_FUENTE: Record<FuenteEvidencia, string> = {
  "NASA POWER": "bg-sky-100 text-sky-900",
  IDEAM: "bg-indigo-100 text-indigo-900",
  MODIS: "bg-green-100 text-green-900",
  SoilGrids: "bg-amber-100 text-amber-900",
  SRTM: "bg-stone-200 text-stone-900",
  OpenStreetMap: "bg-teal-100 text-teal-900",
  ECOCROP: "bg-lime-100 text-lime-900",
  Regla: "bg-slate-200 text-slate-800",
  Agricultor: "bg-fuchsia-100 text-fuchsia-900",
};

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{titulo}</h4>
      <ul className="list-disc space-y-1 pl-4 text-xs text-slate-700">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function TarjetaEstrategiaGlobal({ estrategia, mejor }: { estrategia: EstrategiaRotacionDto; mejor: boolean }) {
  return (
    <article
      className={`space-y-3.5 rounded-2xl border p-4 ${
        mejor ? "border-emerald-600 bg-emerald-50/30" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Estrategia {estrategia.id} · {estrategia.nombre}
          </h3>
          {mejor && (
            <span className="mt-1 inline-block rounded-full bg-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold text-white">
              Seleccionada para tu objetivo
            </span>
          )}
        </div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-900 tabular-nums">
          {Math.round(estrategia.puntajeTotal)} / 100
        </span>
      </div>

      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Justificación</h4>
        <p className="text-xs leading-relaxed text-slate-700">{estrategia.porQue}</p>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Evidencia calculada</h4>
        <ul className="space-y-1 text-xs text-slate-700">
          {estrategia.evidencia.map((ev, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${COLOR_FUENTE[ev.fuente]}`}>
                {ev.fuente}
              </span>
              <span>{ev.texto}</span>
            </li>
          ))}
        </ul>
      </div>

      <Lista titulo="Beneficios" items={estrategia.beneficios} />
      <Lista titulo="Riesgos a vigilar" items={estrategia.riesgos} />
      <Lista titulo="Vacíos de información local" items={estrategia.vaciosInformacion} />

      <div className="space-y-1.5 pt-1">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reglas agronómicas verificadas</h4>
        <ul className="space-y-1 text-xs">
          {estrategia.reglas.map((r) => (
            <li key={r.regla} className="flex items-start gap-1.5">
              {r.cumple ? (
                <IconoCheck width={14} height={14} className="mt-0.5 shrink-0 text-emerald-700" />
              ) : (
                <IconoCerrar width={14} height={14} className="mt-0.5 shrink-0 text-red-600" />
              )}
              <div>
                <span className={r.cumple ? "font-medium text-slate-800" : "font-medium text-red-700"}>
                  {ETIQUETA_REGLA[r.regla]}
                </span>
                <span className="block text-[11px] text-slate-500">{r.detalle}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
