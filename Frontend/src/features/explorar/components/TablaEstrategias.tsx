/**
 * Comparativa de estrategias: filas = A–D; columnas = pasos de la secuencia (cultivo + meses) y puntajes.
 */
import { PRIORIDADES_ROTACION, type ComparacionRotacionesDto } from "@agrocore/contracts";
import { ETIQUETA_PRIORIDAD, mesCorto } from "../types/explorar.types";

export function TablaEstrategias({ comparacion }: { comparacion: ComparacionRotacionesDto }) {
  const { estrategias, estrategiaMejorPuntuada } = comparacion;
  const nPasos = Math.max(...estrategias.map((e) => e.secuencia.length));
  const celda = "border-b border-slate-100 px-2 py-2 align-top";

  return (
    <section aria-labelledby="tabla-estrategias" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="tabla-estrategias" className="text-lg font-bold">⚖️ Comparación de estrategias (2 años)</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
          <caption className="sr-only">Estrategias de rotación: secuencia por paso y puntajes</caption>
          <thead>
            <tr className="border-b border-slate-300 text-xs text-slate-600">
              <th scope="col" className="px-2 py-2">Estrategia</th>
              {Array.from({ length: nPasos }, (_, i) => (
                <th key={i} scope="col" className="px-2 py-2">Paso {i + 1}</th>
              ))}
              {PRIORIDADES_ROTACION.map((p) => (
                <th key={p} scope="col" className="px-2 py-2">{ETIQUETA_PRIORIDAD[p]}</th>
              ))}
              <th scope="col" className="px-2 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {estrategias.map((e) => {
              const mejor = e.id === estrategiaMejorPuntuada;
              return (
                <tr key={e.id} className={mejor ? "bg-emerald-50" : ""}>
                  <th scope="row" className={celda + " font-semibold"}>
                    {e.id} · {e.nombre}
                    {mejor && <span className="mt-1 block text-xs font-normal text-emerald-800">★ Mejor con tus prioridades</span>}
                  </th>
                  {Array.from({ length: nPasos }, (_, i) => {
                    const p = e.secuencia[i];
                    return (
                      <td key={i} className={celda}>
                        {p && (
                          <>
                            <span className="font-medium">{p.cultivoNombre}</span>
                            <span className="block text-xs text-slate-600">
                              {p.continua ? "continúa · " : ""}
                              {mesCorto(p.mesSiembra)} → {mesCorto(p.mesCosecha)} (año {p.anio})
                            </span>
                            {p.requiereRiego && <span className="block text-xs text-blue-700">💧 requiere riego</span>}
                          </>
                        )}
                      </td>
                    );
                  })}
                  {PRIORIDADES_ROTACION.map((pr) => (
                    <td key={pr} className={celda}>
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-12 rounded bg-slate-200" aria-hidden="true">
                          <div className="h-2 rounded bg-slate-700" style={{ width: Math.round(e.puntajes[pr]) + "%" }} />
                        </div>
                        <span>{Math.round(e.puntajes[pr])}</span>
                      </div>
                    </td>
                  ))}
                  <td className={celda + " text-base font-bold"}>{Math.round(e.puntajeTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
