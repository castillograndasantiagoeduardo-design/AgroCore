import type { ReactNode } from "react";
import Link from "next/link";

const ENLACES = [
  { href: "/explorar", texto: "🌍 Explorar" },
  { href: "/rotaciones", texto: "🔄 Rotaciones" },
  { href: "/fincas", texto: "🗺️ Fincas" },
];

/** Layout del contexto (panel): barra de navegación superior y contenedor centrado. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="no-imprimir sticky top-0 z-30 border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌱</span>
            <div className="leading-tight">
              <span className="block text-lg font-bold tracking-tight text-slate-900">AgroCore</span>
              <span className="text-xs font-medium text-slate-500">Rotación de cultivos en cualquier lugar del mundo</span>
            </div>
            <span className="ml-2 hidden rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 sm:inline-block">
              NASA POWER · MODIS · SRTM · OSM
            </span>
          </div>
          <nav className="flex items-center gap-2 text-sm font-medium" aria-label="Principal">
            {ENLACES.map((e) => (
              <Link key={e.href} href={e.href} className="rounded-lg px-3.5 py-1.5 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900">
                {e.texto}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
