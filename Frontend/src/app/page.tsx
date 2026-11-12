import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-3xl">🌱</span>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">AgroCore</h1>
      </div>
      <p className="text-slate-600 text-base leading-relaxed">
        Plataforma inteligente de rotación y planificación de cultivos con datos satelitales NASA POWER y calibración IDEAM.
      </p>
      <div className="flex gap-3 pt-2">
        <Link
          href="/rotaciones"
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors"
        >
          🔄 Ver Rotaciones
        </Link>
        <Link
          href="/fincas"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
        >
          🗺️ Gestionar Fincas en Mapa
        </Link>
      </div>
    </main>
  );
}
