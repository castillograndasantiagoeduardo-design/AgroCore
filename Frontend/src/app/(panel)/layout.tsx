import type { ReactNode } from "react";
import Link from "next/link";

/** Layout del contexto (panel): barra de navegación superior y contenedor centrado. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌱</span>
            <div className="leading-tight">
              <span className="font-bold text-slate-900 tracking-tight text-lg block">AgroCore</span>
              <span className="text-xs text-slate-500 font-medium">Rotación de Cultivos con datos NASA</span>
            </div>
            <span className="hidden sm:inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ml-2">
              NASA POWER + IDEAM
            </span>
          </div>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <Link
              href="/rotaciones"
              className="rounded-lg px-3.5 py-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              🔄 Rotaciones
            </Link>
            <Link
              href="/fincas"
              className="rounded-lg px-3.5 py-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              🗺️ Fincas y Mapa
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
