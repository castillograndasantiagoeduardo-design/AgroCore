/**
 * Ficha del terreno: suelo, elevación, pendiente, cobertura MODIS, humedad del suelo y NDVI.
 */
import type { PerfilTerrenoDto } from "@agrocore/contracts";
import { listaMeses, mesCorto } from "../types/explorar.types";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number | null | undefined }) {
  const sin = valor === null || valor === undefined;
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className={sin ? "text-sm italic text-slate-400" : "text-sm font-semibold text-slate-900"}>{sin ? "sin dato" : valor}</dd>
    </div>
  );
}

function BarrasMensuales({ titulo, valores, max, color, descripcion }: { titulo: string; valores: (number | null)[]; max: number; color: string; descripcion: string }) {
  const ancho = 240;
  const alto = 70;
  const paso = ancho / 12;
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-semibold text-slate-700">{titulo}</figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto + 14}`} role="img" aria-label={descripcion} className="w-full max-w-md">
        {valores.map((v, i) => {
          const h = v === null ? 0 : Math.max(0, Math.min(1, v / max)) * alto;
          return (
            <g key={i}>
              <rect x={i * paso + 2} y={alto - h} width={paso - 4} height={h} rx={1.5} fill={color}>
                <title>{`${mesCorto(i + 1)}: ${v === null ? "sin dato" : v.toFixed(2)}`}</title>
              </rect>
              <text x={i * paso + paso / 2} y={alto + 11} textAnchor="middle" fontSize={7} fill="#64748b">
                {mesCorto(i + 1).charAt(0)}
              </text>
            </g>
          );
        })}
        <line x1={0} y1={alto} x2={ancho} y2={alto} stroke="#cbd5e1" strokeWidth={0.5} />
      </svg>
    </figure>
  );
}

export function FichaTerreno({ perfil }: { perfil: PerfilTerrenoDto }) {
  const { suelo, ndvi, cobertura, humedadSuelo } = perfil;
  const humedad = humedadSuelo ? [...humedadSuelo].sort((a, b) => a.mes - b.mes) : null;
  const clim = ndvi ? [...ndvi.climatologia].sort((a, b) => a.mes - b.mes) : null;

  return (
    <section aria-labelledby="ficha-terreno" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="ficha-terreno" className="text-lg font-bold">🌍 Terreno y suelo</h2>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Dato etiqueta="Textura" valor={suelo?.textura ?? null} />
        <Dato etiqueta="pH" valor={suelo?.ph !== null && suelo?.ph !== undefined ? suelo.ph.toFixed(1) : null} />
        <Dato etiqueta="Carbono orgánico (g/kg)" valor={suelo?.carbonoOrganicoGKg ?? null} />
        <Dato etiqueta="Nitrógeno (g/kg)" valor={suelo?.nitrogenoGKg ?? null} />
        <Dato etiqueta="Elevación (m)" valor={perfil.elevacionM !== null ? Math.round(perfil.elevacionM) : null} />
        <Dato etiqueta="Pendiente (%)" valor={perfil.pendientePct !== null ? perfil.pendientePct.toFixed(1) : null} />
        <Dato etiqueta="Cobertura MODIS" valor={cobertura ? `${cobertura.nombre} (${cobertura.anio})` : null} />
        <Dato etiqueta="Arena / limo / arcilla (%)" valor={suelo && suelo.arenaPct !== null ? `${suelo.arenaPct} / ${suelo.limoPct ?? "?"} / ${suelo.arcillaPct ?? "?"}` : null} />
      </dl>
      {!suelo && <p className="text-xs text-amber-700">Sin datos de suelo (SoilGrids no respondió o no cubre el sitio).</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {humedad ? (
          <BarrasMensuales
            titulo="Humedad del suelo (raíz, 0–1)"
            valores={humedad.map((h) => h.raiz ?? h.superficie)}
            max={1}
            color="#0ea5e9"
            descripcion="Humedad mensual del suelo en la zona de raíces"
          />
        ) : (
          <p className="text-xs italic text-slate-500">Humedad del suelo: sin dato.</p>
        )}
        {clim ? (
          <BarrasMensuales
            titulo="NDVI medio por mes (0–1)"
            valores={clim.map((c) => c.ndviMedio)}
            max={1}
            color="#16a34a"
            descripcion="Climatología mensual del índice de vegetación NDVI"
          />
        ) : (
          <p className="text-xs italic text-slate-500">NDVI: sin dato.</p>
        )}
      </div>

      {ndvi && (
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-semibold">Meses baldíos:</span> {listaMeses(ndvi.mesesBaldios)}
            <span className="block text-xs text-slate-500">{ndvi.reglaBaldio}</span>
          </p>
          <p>
            <span className="font-semibold">Estrés de vegetación:</span>{" "}
            {ndvi.estres.mesesConEstres.length > 0 ? listaMeses(ndvi.estres.mesesConEstres) : "sin meses con estrés"}
            <span className="block text-xs text-slate-500">{ndvi.estres.detalle}</span>
          </p>
          <p className="text-xs text-slate-500">Fuente NDVI: {ndvi.fuente} ({ndvi.desde} a {ndvi.hasta})</p>
        </div>
      )}
      {perfil.vaciosInformacion.length > 0 && (
        <p className="text-xs text-slate-500">Vacíos: {perfil.vaciosInformacion.join(" · ")}</p>
      )}
    </section>
  );
}
