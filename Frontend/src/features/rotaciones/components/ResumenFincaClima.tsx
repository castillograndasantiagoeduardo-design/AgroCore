/**
 * Resumen de la finca y del clima usados en la comparación.
 */
import type { ComparacionRotacionesDto } from "@agrocore/contracts";
import { listaMeses } from "../types/rotaciones.types";

export function ResumenFincaClima({ comparacion }: { comparacion: ComparacionRotacionesDto }) {
  const { finca, clima, ventanasSiembra } = comparacion;
  return (
    <section className="space-y-2 rounded border border-slate-300 p-4 text-sm">
      <h2 className="text-lg font-bold">{finca.nombre}</h2>
      <ul className="grid gap-1 sm:grid-cols-2">
        <li>
          Altitud: {finca.altitudReferenciaM} m {finca.altitudConocida ? "" : "(estimada del perfil climático)"}
        </li>
        <li>Clima: {finca.clasificacionClimatica}</li>
        <li>Riego: {finca.tieneRiego ? "Sí" : "No"}</li>
        <li>Cultivo actual: {finca.cultivoActual ?? "Sin registrar"}</li>
        <li>Lluvia anual: {Math.round(clima.lluviaAnualMm)} mm</li>
        <li>Meses lluviosos: {listaMeses(clima.mesesLluviosos)}</li>
        <li>Meses con riesgo de helada: {listaMeses(clima.mesesRiesgoHelada)}</li>
        <li>
          Fuente del clima: {clima.fuente} ({clima.calibrado ? "calibrado" : "sin calibrar"})
        </li>
      </ul>
      <div>
        <h3 className="font-semibold">Ventanas de siembra</h3>
        <ul className="list-disc pl-5">
          {ventanasSiembra.map((v) => (
            <li key={v.semestreDelAnio}>
              Semestre {v.semestreDelAnio}: {v.nombreMes}
              {v.coincideConLluvias ? "" : " (no coincide con meses lluviosos; se usó el mes por defecto)"}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
