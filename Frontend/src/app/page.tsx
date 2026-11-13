import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <div className="flex items-center gap-2">
        <span className="text-3xl">🌱</span>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">AgroCore</h1>
      </div>
      <p className="text-base leading-relaxed text-slate-600">
        Marca un punto o un área en el mapa de cualquier lugar del mundo y mira su suelo, terreno y clima, qué cultivos
        son aptos, un calendario del lote y una comparación de estrategias de rotación con evidencia y fuentes (NASA
        POWER, MODIS, SRTM, SoilGrids, OpenStreetMap).
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          href="/explorar"
          className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-800"
        >
          🌍 Explorar un lugar
        </Link>
        <Link
          href="/rotaciones"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
        >
          🔄 Rotaciones de una finca
        </Link>
        <Link
          href="/fincas"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
        >
          🗺️ Fincas
        </Link>
      </div>
    </main>
  );
}
