/**
 * Fuentes consultadas, vacíos de información y advertencias técnicas (sin emojis).
 */
import type { ComparacionRotacionesDto, PerfilTerrenoDto } from "@agrocore/contracts";
import { IconoInfo } from "@/components/ui/Iconos";

interface Props {
  perfil: PerfilTerrenoDto | null;
  comparacion: ComparacionRotacionesDto | null;
}

export function FuentesYVacios({ perfil, comparacion }: Props) {
  const fuentes = Array.from(
    new Set([...(perfil?.fuentes ?? []), ...(comparacion?.terreno.fuentes ?? []), ...(comparacion ? [comparacion.clima.fuente] : [])]),
  );
  const vacios = perfil?.vaciosInformacion ?? [];
  const advertencias = Array.from(new Set([...(perfil?.advertencias ?? []), ...(comparacion?.advertencias ?? [])]));
  const aviso =
    comparacion?.aviso ?? "Este sistema sugiere y explica con datos; no reemplaza el criterio del agricultor ni del agrónomo.";

  return (
    <section aria-labelledby="fuentes" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-xs">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <IconoInfo width={16} height={16} />
        </span>
        <h3 id="fuentes" className="text-sm font-bold text-slate-900">
          Fuentes satelitales, vacíos y alcance
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {fuentes.length > 0 && (
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-800">Fuentes consultadas</h4>
            <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
              {fuentes.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {vacios.length > 0 && (
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-800">Datos locales por verificar en campo</h4>
            <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
              {vacios.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {advertencias.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
          <h4 className="font-semibold">Notas técnicas</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="rounded-xl bg-slate-50 p-3 text-slate-600">{aviso}</p>
    </section>
  );
}
