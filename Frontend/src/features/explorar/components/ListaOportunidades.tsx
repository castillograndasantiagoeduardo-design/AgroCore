/**
 * Oportunidades de rotación detectadas (con meses y fuentes).
 */
import type { OportunidadDto, TipoOportunidad } from "@agrocore/contracts";
import { listaMeses } from "../types/explorar.types";

const ETIQUETA_TIPO: Record<TipoOportunidad, string> = {
  baldio_cobertura: "🌾 Cubrir el baldío",
  temporada_vulnerable: "🛡️ Temporada vulnerable",
  romper_ciclo_plagas: "🐛 Romper ciclo de plagas",
  menor_demanda_agua: "💧 Menor demanda de agua",
  mejorar_infiltracion: "🌱 Mejorar infiltración",
  sumar_ingreso: "💰 Sumar ingreso",
};

export function ListaOportunidades({ oportunidades }: { oportunidades: OportunidadDto[] }) {
  return (
    <section aria-labelledby="oportunidades" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="oportunidades" className="text-lg font-bold">🌟 Oportunidades</h2>
      <ul className="space-y-2">
        {oportunidades.map((o, i) => (
          <li key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
            <p className="font-semibold">{ETIQUETA_TIPO[o.tipo]}</p>
            <p>{o.texto}</p>
            <p className="mt-1 text-xs text-slate-600">
              Meses: {listaMeses(o.meses)} · Fuentes: {o.fuentes.join(", ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
