/**
 * Banner de aptitud del terreno: rojo si no es apto (carretera, edificación, agua...), ámbar si se excluye parte del área.
 */
import type { PerfilTerrenoDto } from "@agrocore/contracts";

export function BannerAptitud({ perfil }: { perfil: PerfilTerrenoDto }) {
  if (perfil.aptitud !== "apto") {
    return (
      <div role="alert" className="rounded-xl border-2 border-red-600 bg-red-50 p-5 text-red-900">
        <p className="text-2xl font-extrabold">⛔ {perfil.mensajeAptitud}</p>
        {perfil.viasCercanas[0] && perfil.aptitud === "no_apto_carretera" && (
          <p className="mt-1 text-sm">
            Vía detectada: {perfil.viasCercanas[0].nombre ?? perfil.viasCercanas[0].tipo} ({perfil.viasCercanas[0].tipo}), a{" "}
            {Math.round(perfil.viasCercanas[0].distanciaM)} m del punto. Se resalta en rojo en el mapa.
          </p>
        )}
        <p className="mt-1 text-sm">No se calculan rotaciones para este sitio. Prueba con otro punto u otra área.</p>
      </div>
    );
  }
  if (perfil.afectacion.excluidoPct > 0) {
    return (
      <div role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">⚠️ {perfil.mensajeAptitud}</p>
        <p>
          Carretera {perfil.afectacion.carreteraPct.toFixed(0)} % · edificación {perfil.afectacion.edificacionPct.toFixed(0)} % · agua{" "}
          {perfil.afectacion.aguaPct.toFixed(0)} %. Esa parte no se considera en el análisis.
        </p>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
      ✅ {perfil.mensajeAptitud}
    </div>
  );
}
