/**
 * Tarjeta de una estrategia: por qué, evidencia con fuente, beneficios, vacíos, riesgos y reglas.
 */
import type { EstrategiaRotacionDto, FuenteEvidencia } from "@agrocore/contracts";
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
    <div>
      <h4 className="text-sm font-semibold">{titulo}</h4>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function TarjetaEstrategiaGlobal({ estrategia, mejor }: { estrategia: EstrategiaRotacionDto; mejor: boolean }) {
  return (
    <article className={`space-y-3 rounded-xl border p-4 ${mejor ? "border-emerald-500 bg-emerald-50/40" : "border-slate-300 bg-white"}`}>
      <h3 className="text-base font-bold">
        Estrategia {estrategia.id} · {estrategia.nombre}
      </h3>
      {mejor && <p className="text-sm font-medium text-emerald-800">★ Mejor puntaje con tus prioridades</p>}
      <div>
        <h4 className="text-sm font-semibold">Por qué</h4>
        <p className="text-sm">{estrategia.porQue}</p>
      </div>
      <div>
        <h4 className="text-sm font-semibold">Evidencia</h4>
        <ul className="space-y-1 text-sm">
          {estrategia.evidencia.map((ev, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${COLOR_FUENTE[ev.fuente]}`}>{ev.fuente}</span>
              <span>{ev.texto}</span>
            </li>
          ))}
        </ul>
      </div>
      <Lista titulo="Beneficios" items={estrategia.beneficios} />
      <Lista titulo="Lo que el sistema no sabe" items={estrategia.vaciosInformacion} />
      <Lista titulo="Riesgos (revisar con un agrónomo)" items={estrategia.riesgos} />
      <div>
        <h4 className="text-sm font-semibold">Reglas agronómicas</h4>
        <ul className="space-y-0.5 text-xs">
          {estrategia.reglas.map((r) => (
            <li key={r.regla} title={r.detalle} className={r.cumple ? "text-emerald-800" : "text-red-700"}>
              {r.cumple ? "✔" : "✘"} {ETIQUETA_REGLA[r.regla]}
              <span className="block pl-4 text-slate-500">{r.detalle}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
