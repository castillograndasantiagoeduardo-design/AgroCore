/**
 * Ficha técnica del terreno: suelo, elevación, pendiente, cobertura MODIS, humedad y NDVI (sin barras redundantes ni emojis).
 */
import type { PerfilTerrenoDto } from "@agrocore/contracts";
import { IconoCapas } from "@/components/ui/Iconos";
import { listaMeses } from "../types/explorar.types";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number | null | undefined }) {
  const sin = valor === null || valor === undefined;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <dt className="text-xs font-medium text-slate-500">{etiqueta}</dt>
      <dd className={sin ? "mt-0.5 text-sm italic text-slate-400" : "mt-0.5 text-sm font-semibold text-slate-900"}>
        {sin ? "Sin dato" : valor}
      </dd>
    </div>
  );
}

export function FichaTerreno({ perfil }: { perfil: PerfilTerrenoDto }) {
  const { suelo, ndvi, cobertura, humedadSuelo } = perfil;

  const promedioHumedad =
    humedadSuelo && humedadSuelo.length > 0
      ? (() => {
          const validos = humedadSuelo.map((h) => h.raiz ?? h.superficie).filter((v): v is number => v !== null);
          return validos.length > 0 ? `${Math.round((validos.reduce((a, b) => a + b, 0) / validos.length) * 100)} %` : null;
        })()
      : null;

  const promedioNdvi =
    ndvi && ndvi.climatologia.length > 0
      ? (() => {
          const validos = ndvi.climatologia.map((c) => c.ndviMedio).filter((v): v is number => v !== null);
          return validos.length > 0 ? (validos.reduce((a, b) => a + b, 0) / validos.length).toFixed(2) : null;
        })()
      : null;

  return (
    <section aria-labelledby="ficha-terreno" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <IconoCapas width={18} height={18} />
        </span>
        <div>
          <h3 id="ficha-terreno" className="text-base font-bold text-slate-900">
            Propiedades físicas del terreno y suelo
          </h3>
          <p className="text-xs text-slate-500">Datos satelitales SRTM, SoilGrids, MODIS y NASA POWER</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Dato etiqueta="Textura estimada" valor={suelo?.textura ?? null} />
        <Dato etiqueta="pH del suelo (0–30 cm)" valor={suelo?.ph !== null && suelo?.ph !== undefined ? suelo.ph.toFixed(1) : null} />
        <Dato etiqueta="Carbono orgánico (g/kg)" valor={suelo?.carbonoOrganicoGKg ?? null} />
        <Dato etiqueta="Nitrógeno total (g/kg)" valor={suelo?.nitrogenoGKg ?? null} />
        <Dato etiqueta="Elevación SRTM (m)" valor={perfil.elevacionM !== null ? `${Math.round(perfil.elevacionM)} m` : null} />
        <Dato etiqueta="Pendiente media" valor={perfil.pendientePct !== null ? `${perfil.pendientePct.toFixed(1)} %` : null} />
        <Dato etiqueta="Cobertura MODIS" valor={cobertura ? `${cobertura.nombre} (${cobertura.anio})` : null} />
        <Dato
          etiqueta="Arena / limo / arcilla (%)"
          valor={
            suelo && suelo.arenaPct !== null ? `${suelo.arenaPct} / ${suelo.limoPct ?? "-"} / ${suelo.arcillaPct ?? "-"}` : null
          }
        />
        <Dato etiqueta="Humedad radicular media" valor={promedioHumedad} />
        <Dato etiqueta="Índice vegetal NDVI medio" valor={promedioNdvi} />
      </dl>

      {!suelo && (
        <p className="text-xs text-amber-800">
          ISRIC SoilGrids no reportó propiedades químicas para esta coordenada; se recomienda complementar con análisis físico-químico local.
        </p>
      )}

      {ndvi && (
        <div className="grid gap-3 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700 sm:grid-cols-2">
          <div>
            <span className="font-semibold text-slate-900">Meses habitualmente sin cobertura: </span>
            <span>{listaMeses(ndvi.mesesBaldios)}</span>
            <p className="mt-0.5 text-[11px] text-slate-500">{ndvi.reglaBaldio}</p>
          </div>
          <div>
            <span className="font-semibold text-slate-900">Estrés histórico de vegetación: </span>
            <span>{ndvi.estres.mesesConEstres.length > 0 ? listaMeses(ndvi.estres.mesesConEstres) : "ninguno detectado"}</span>
            <p className="mt-0.5 text-[11px] text-slate-500">{ndvi.estres.detalle}</p>
          </div>
        </div>
      )}
    </section>
  );
}
