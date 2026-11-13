/**
 * Calendario del lote: 12 meses con 3 franjas (baldío, vulnerable, oportunidad) y marca de temporada.
 */
import type { MesCalendarioDto, SeveridadAmenaza } from "@agrocore/contracts";
import { mesCorto } from "../types/explorar.types";

const COLOR_SEVERIDAD: Record<SeveridadAmenaza, string> = {
  baja: "bg-yellow-300",
  media: "bg-orange-400",
  alta: "bg-red-600",
};

function tooltipVulnerable(m: MesCalendarioDto): string {
  const amenazas = m.vulnerabilidad.amenazas.map((a) => `${a.tipo} (${a.severidad}): ${a.detalle}`).join("\n");
  const exp = m.cultivosExpuestos.length > 0 ? `\nCultivos expuestos: ${m.cultivosExpuestos.join(", ")}` : "";
  return `${m.nombreMes}\n${amenazas}${exp}`;
}

export function CalendarioLote({ calendario }: { calendario: MesCalendarioDto[] }) {
  const meses = [...calendario].sort((a, b) => a.mes - b.mes);
  const fila = "grid grid-cols-12 gap-1";
  const franja = "h-6 rounded-sm";

  return (
    <section aria-labelledby="calendario-lote" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="calendario-lote" className="text-lg font-bold">📅 Calendario del lote</h2>
      <div className="overflow-x-auto">
        <div className="min-w-[36rem] space-y-1">
          <div className={fila} aria-hidden="true">
            {meses.map((m) => (
              <div key={m.mes} className={`text-center text-xs font-semibold ${m.enTemporada ? "rounded bg-emerald-100 text-emerald-900" : "text-slate-600"}`}>
                {mesCorto(m.mes)}
              </div>
            ))}
          </div>
          <div className={fila} role="list" aria-label="Meses baldíos">
            {meses.map((m) => (
              <div
                key={m.mes}
                role="listitem"
                title={m.baldio ? `${m.nombreMes}: suele estar baldío (sin cultivo)` : `${m.nombreMes}: con vegetación`}
                aria-label={`${m.nombreMes} ${m.baldio ? "baldío" : "con vegetación"}`}
                className={`${franja} ${m.baldio ? "bg-stone-500" : "bg-stone-100"}`}
              />
            ))}
          </div>
          <div className={fila} role="list" aria-label="Meses vulnerables">
            {meses.map((m) => {
              const sev = m.vulnerabilidad.severidadMaxima;
              return (
                <div
                  key={m.mes}
                  role="listitem"
                  tabIndex={sev ? 0 : -1}
                  title={sev ? tooltipVulnerable(m) : `${m.nombreMes}: sin amenazas`}
                  aria-label={sev ? `${m.nombreMes} vulnerable, severidad ${sev}` : `${m.nombreMes} sin amenazas`}
                  className={`${franja} ${sev ? COLOR_SEVERIDAD[sev] : "bg-slate-100"}`}
                />
              );
            })}
          </div>
          <div className={fila} role="list" aria-label="Meses con oportunidad">
            {meses.map((m) => (
              <div
                key={m.mes}
                role="listitem"
                title={m.oportunidad ? `${m.nombreMes}: hay una oportunidad de rotación` : `${m.nombreMes}: sin oportunidad`}
                aria-label={`${m.nombreMes} ${m.oportunidad ? "con oportunidad" : "sin oportunidad"}`}
                className={`${franja} ${m.oportunidad ? "bg-emerald-500" : "bg-slate-100"}`}
              />
            ))}
          </div>
          <div className={fila} aria-hidden="true">
            {meses.map((m) => (
              <div key={m.mes} className="text-center text-xs text-emerald-700">
                {m.enTemporada ? "●" : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        <li><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-stone-500 align-middle" />Baldío (1.ª franja)</li>
        <li>
          Vulnerable (2.ª franja):
          <span className="mx-1 inline-block h-3 w-3 rounded-sm bg-yellow-300 align-middle" />baja
          <span className="mx-1 inline-block h-3 w-3 rounded-sm bg-orange-400 align-middle" />media
          <span className="mx-1 inline-block h-3 w-3 rounded-sm bg-red-600 align-middle" />alta
        </li>
        <li><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-emerald-500 align-middle" />Oportunidad (3.ª franja)</li>
        <li><span className="mr-1 text-emerald-700">●</span>Mes en temporada de cultivo</li>
      </ul>
    </section>
  );
}
