/**
 * Tabla comparativa A/B/C: semestres, puntajes y reglas agronómicas.
 */
import {
  PRIORIDADES_ROTACION,
  REGLAS_ROTACION,
  type ComparacionRotacionesDto,
  type PasoRotacionDto,
} from "@duitamacrece/contracts";
import { ETIQUETA_PRIORIDAD, ETIQUETA_REGLA, nombreMes } from "../types/rotaciones.types";

function PasoCelda({ paso }: { paso: PasoRotacionDto }) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{paso.cultivoNombre}</p>
      <p className="text-xs text-slate-600">
        {paso.continuaPradera ? "Continúa la pradera" : "Siembra " + nombreMes(paso.mesSiembra)} → cosecha {nombreMes(paso.mesCosecha)}
      </p>
      <ul className="flex flex-wrap gap-1 text-xs">
        {paso.continuaPradera && <li className="rounded bg-green-100 px-1">🌿 Continúa la pradera</li>}
        {paso.riesgoHelada === "moderado" && <li className="rounded bg-amber-100 px-1">⚠ Riesgo de helada moderado</li>}
        {paso.riesgoHelada === "alto" && <li className="rounded bg-red-100 px-1">⛔ Riesgo de helada alto</li>}
        {paso.requiereRiego && <li className="rounded bg-blue-100 px-1">💧 Requiere riego</li>}
      </ul>
    </div>
  );
}

export function TablaComparativa({ comparacion }: { comparacion: ComparacionRotacionesDto }) {
  const { estrategias, estrategiaMejorPuntuada } = comparacion;
  const celda = "border-b px-3 py-2 align-top";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Comparación de las estrategias de rotación A, B y C</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="px-3 py-2">Concepto</th>
            {estrategias.map((e) => (
              <th key={e.id} scope="col" className="px-3 py-2">
                <p>{e.id} · {e.nombre}</p>
                {e.id === estrategiaMejorPuntuada && (
                  <p className="mt-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-900">
                    ★ Mejor puntaje con tus prioridades
                  </p>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3].map((i) => (
            <tr key={"sem" + i}>
              <th scope="row" className={celda + " font-medium"}>
                Año {Math.floor(i / 2) + 1} · semestre {(i % 2) + 1}
              </th>
              {estrategias.map((e) => (
                <td key={e.id} className={celda}>
                  {e.secuencia[i] && <PasoCelda paso={e.secuencia[i]} />}
                </td>
              ))}
            </tr>
          ))}
          <tr className="bg-slate-50">
            <th scope="row" className={celda + " font-bold"}>Puntaje total (0–100)</th>
            {estrategias.map((e) => (
              <td key={e.id} className={celda + " font-bold"}>{Math.round(e.puntajeTotal)}</td>
            ))}
          </tr>
          {PRIORIDADES_ROTACION.map((p) => (
            <tr key={p}>
              <th scope="row" className={celda + " font-normal"}>{ETIQUETA_PRIORIDAD[p]}</th>
              {estrategias.map((e) => (
                <td key={e.id} className={celda}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded bg-slate-200" aria-hidden="true">
                      <div className="h-2 rounded bg-slate-700" style={{ width: Math.round(e.puntajes[p]) + "%" }} />
                    </div>
                    <span>{Math.round(e.puntajes[p])}</span>
                  </div>
                </td>
              ))}
            </tr>
          ))}
          {REGLAS_ROTACION.map((r) => (
            <tr key={r}>
              <th scope="row" className={celda + " font-normal"}>{ETIQUETA_REGLA[r]}</th>
              {estrategias.map((e) => {
                const ev = e.reglas.find((x) => x.regla === r);
                if (!ev) return <td key={e.id} className={celda}>—</td>;
                return (
                  <td key={e.id} className={celda} title={ev.detalle}>
                    <span className="font-medium">{ev.cumple ? "✔ Cumple" : "✘ No cumple"}</span>
                    <span className="block text-xs text-slate-600">{ev.detalle}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
