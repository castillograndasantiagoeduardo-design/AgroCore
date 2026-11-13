import type { ReactNode } from "react";
import Link from "next/link";
import { IconoHoja } from "@/components/ui/Iconos";

/** Layout principal de la aplicación: cabecera limpia sin emojis y contenedor directo. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="no-imprimir sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <IconoHoja width={20} height={20} />
            </span>
            <div className="leading-tight">
              <span className="block text-lg font-bold tracking-tight text-slate-900">AgroCore</span>
              <span className="text-xs font-medium text-slate-500">
                Recomendación agrícola inteligente por época y objetivo
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 sm:inline-block">
              NASA POWER · MODIS · SRTM · OSM
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
