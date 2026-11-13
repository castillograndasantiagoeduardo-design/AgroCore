/**
 * Oportunidades de mejora agronómica detectadas (sin emojis).
 */
import type { OportunidadDto } from "@agrocore/contracts";
import { IconoHoja } from "@/components/ui/Iconos";
import { ETIQUETA_OPORTUNIDAD, listaMeses } from "../types/explorar.types";

export function ListaOportunidades({ oportunidades }: { oportunidades: OportunidadDto[] }) {
  return (
    <section aria-labelledby="oportunidades" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
          <IconoHoja width={18} height={18} />
        </span>
        <div>
          <h3 id="oportunidades" className="text-base font-bold text-slate-900">
            Oportunidades adicionales en el lote
          </h3>
          <p className="text-xs text-slate-500">Mejoras detectadas según clima y vegetación histórica</p>
        </div>
      </div>

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {oportunidades.map((o, i) => (
          <li key={i} className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 text-xs">
            <p className="font-semibold text-slate-900">{ETIQUETA_OPORTUNIDAD[o.tipo]}</p>
            <p className="mt-1 leading-relaxed text-slate-700">{o.texto}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Meses clave: {listaMeses(o.meses)} · Fuentes: {o.fuentes.join(", ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
