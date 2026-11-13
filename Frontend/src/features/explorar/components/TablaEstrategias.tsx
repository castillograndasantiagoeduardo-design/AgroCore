/**
 * Tabla comparativa de estrategias de 2 años: limpia, sin barras de progreso ni emojis.
 */
import { PRIORIDADES_ROTACION, type ComparacionRotacionesDto, type IdEstrategia } from "@agrocore/contracts";
import { ETIQUETA_PRIORIDAD, mesCorto } from "../types/explorar.types";

interface Props {
  comparacion: ComparacionRotacionesDto;
  estrategiaDestacadaId?: IdEstrategia;
}

export function TablaEstrategias({ comparacion, estrategiaDestacadaId }: Props) {
  const { estrategias, estrategiaMejorPuntuada } = comparacion;
  const destacada = estrategiaDestacadaId ?? estrategiaMejorPuntuada;
  const nPasos = Math.max(...estrategias.map((e) => e.secuencia.length));
  const celda = "border-b border-slate-100 px-3 py-2.5 align-top";

  return (
    <section aria-labelledby="tabla-estrategias" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h3 id="tabla-estrategias" className="text-base font-bold text-slate-900">
          Comparación de estrategias a 2 años
        </h3>
        <p className="text-xs text-slate-500">
          Secuencia de cultivos por ventana climática y calificación numérica sobre 100 puntos
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
          <caption className="sr-only">Estrategias de rotación: secuencia por paso y puntajes</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
              <th scope="col" className="px-3 py-2">Estrategia</th>
              {Array.from({ length: nPasos }, (_, i) => (
                <th key={i} scope="col" className="px-3 py-2">Etapa {i + 1}</th>
              ))}
              {PRIORIDADES_ROTACION.map((p) => (
                <th key={p} scope="col" className="px-3 py-2 text-right">{ETIQUETA_PRIORIDAD[p]}</th>
              ))}
              <th scope="col" className="px-3 py-2 text-right">Global</th>
            </tr>
          </thead>
          <tbody>
            {estrategias.map((e) => {
              const mejor = e.id === destacada;
              return (
                <tr key={e.id} className={mejor ? "bg-emerald-50/70" : "hover:bg-slate-50/70"}>
                  <th scope="row" className={celda + " font-semibold text-slate-900"}>
                    <span>{e.id} · {e.nombre}</span>
                    {mejor && (
                      <span className="mt-1 inline-block rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Recomendada para tu objetivo
                      </span>
                    )}
                  </th>
                  {Array.from({ length: nPasos }, (_, i) => {
                    const p = e.secuencia[i];
                    return (
                      <td key={i} className={celda}>
                        {p && (
                          <>
                            <span className="font-semibold text-slate-900">{p.cultivoNombre}</span>
                            <span className="block text-xs text-slate-500">
                              {p.continua ? "Continúa · " : ""}
                              {mesCorto(p.mesSiembra)} a {mesCorto(p.mesCosecha)} (Año {p.anio})
                            </span>
                            {p.requiereRiego && (
                              <span className="mt-0.5 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                                Requiere riego
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                  {PRIORIDADES_ROTACION.map((pr) => (
                    <td key={pr} className={celda + " text-right font-medium text-slate-700 tabular-nums"}>
                      {Math.round(e.puntajes[pr])}
                    </td>
                  ))}
                  <td className={celda + " text-right text-base font-bold text-slate-900 tabular-nums"}>
                    {Math.round(e.puntajeTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
