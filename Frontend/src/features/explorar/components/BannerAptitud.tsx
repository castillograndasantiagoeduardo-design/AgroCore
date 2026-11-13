/**
 * Banner de aptitud del terreno con iconografía vectorial (sin emojis).
 */
import type { PerfilTerrenoDto } from "@agrocore/contracts";
import { IconoAlerta, IconoBloqueo, IconoCheck } from "@/components/ui/Iconos";

export function BannerAptitud({ perfil }: { perfil: PerfilTerrenoDto }) {
  if (perfil.aptitud !== "apto") {
    return (
      <div role="alert" className="flex items-start gap-3.5 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
          <IconoBloqueo width={20} height={20} />
        </span>
        <div className="space-y-1">
          <p className="text-lg font-bold">{perfil.mensajeAptitud}</p>
          {perfil.viasCercanas[0] && perfil.aptitud === "no_apto_carretera" && (
            <p className="text-sm text-red-800">
              Vía detectada: {perfil.viasCercanas[0].nombre ?? perfil.viasCercanas[0].tipo} ({perfil.viasCercanas[0].tipo}), a{" "}
              {Math.round(perfil.viasCercanas[0].distanciaM)} m del punto seleccionado. Se resalta en rojo sobre el mapa.
            </p>
          )}
          <p className="text-sm text-red-800">
            No se generan recomendaciones de siembra sobre esta ubicación. Selecciona un lote agrícola cercano en el mapa.
          </p>
        </div>
      </div>
    );
  }
  if (perfil.afectacion.excluidoPct > 0) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-900">
          <IconoAlerta width={16} height={16} />
        </span>
        <div>
          <p className="font-semibold">{perfil.mensajeAptitud}</p>
          <p className="text-xs text-amber-800">
            Área descontada del cálculo: vías {perfil.afectacion.carreteraPct.toFixed(0)} % · edificaciones{" "}
            {perfil.afectacion.edificacionPct.toFixed(0)} % · cuerpos de agua {perfil.afectacion.aguaPct.toFixed(0)} %.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-sm font-medium text-emerald-900">
      <IconoCheck width={18} height={18} className="shrink-0 text-emerald-700" />
      <span>{perfil.mensajeAptitud}</span>
    </div>
  );
}
