/**
 * Resumen del sitio (finca) y del clima usados en la comparación.
 */
import type { ComparacionRotacionesDto } from "@agrocore/contracts";
import { listaMeses, nombreMes } from "../types/rotaciones.types";

export function ResumenFincaClima({ comparacion }: { comparacion: ComparacionRotacionesDto }) {
  const { sitio, clima, terreno, ventanas } = comparacion;
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <h2 className="text-lg font-bold">{sitio.nombre ?? "Sitio analizado"}</h2>
      <ul className="grid gap-1 sm:grid-cols-2">
        <li>Altitud: {Math.round(sitio.altitudReferenciaM)} m (fuente: {sitio.fuenteAltitud})</li>
        <li>Clima: {sitio.clasificacionClimatica}</li>
        <li>Riego: {sitio.tieneRiego ? "Sí" : "No"}</li>
        <li>Cultivo actual: {sitio.cultivoActual}</li>
        <li>Lluvia anual: {Math.round(clima.lluviaAnualMm)} mm</li>
        <li>Meses lluviosos: {listaMeses(clima.mesesLluviosos)}</li>
        <li>Meses con riesgo de helada: {listaMeses(clima.mesesRiesgoHelada)}</li>
        <li>Meses baldíos: {listaMeses(terreno.mesesBaldios)}</li>
        <li>
          Fuente del clima: {clima.fuente} ({clima.calibrado ? "calibrado" : "sin calibrar"})
        </li>
        <li>{terreno.mensajeAptitud}</li>
      </ul>
      <div>
        <h3 className="font-semibold">Ventanas de siembra (se repiten cada año)</h3>
        <ul className="list-disc pl-5">
          {ventanas.map((v) => (
            <li key={v.indice}>
              {v.nombre}: siembra en {nombreMes(v.mesInicio)} ({v.tipo === "temporada" ? "temporada de cultivo" : "intervalo entre temporadas"})
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
