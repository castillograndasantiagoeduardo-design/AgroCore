/**
 * Fuentes de datos (terreno + clima), vacíos de información, advertencias y aviso.
 */
import type { ComparacionRotacionesDto, PerfilTerrenoDto } from "@agrocore/contracts";

interface Props {
  perfil: PerfilTerrenoDto | null;
  comparacion: ComparacionRotacionesDto | null;
}

export function FuentesYVacios({ perfil, comparacion }: Props) {
  const fuentes = Array.from(new Set([...(perfil?.fuentes ?? []), ...(comparacion?.terreno.fuentes ?? []), ...(comparacion ? [comparacion.clima.fuente] : [])]));
  const vacios = perfil?.vaciosInformacion ?? [];
  const advertencias = Array.from(new Set([...(perfil?.advertencias ?? []), ...(comparacion?.advertencias ?? [])]));
  const aviso = comparacion?.aviso ?? "Este sistema sugiere y explica con datos; no reemplaza el criterio del agricultor ni del agrónomo.";

  return (
    <section aria-labelledby="fuentes" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <h2 id="fuentes" className="text-lg font-bold">📚 Fuentes, vacíos y advertencias</h2>
      {fuentes.length > 0 && (
        <div>
          <h3 className="font-semibold">Fuentes consultadas</h3>
          <ul className="list-disc pl-5">
            {fuentes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {vacios.length > 0 && (
        <div>
          <h3 className="font-semibold">Vacíos de información</h3>
          <ul className="list-disc pl-5">
            {vacios.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      {advertencias.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <h3 className="font-semibold">Advertencias</h3>
          <ul className="list-disc pl-5">
            {advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="rounded-lg border border-slate-300 bg-slate-50 p-3">{aviso}</p>
    </section>
  );
}
