/**
 * Tarjeta con la explicación de una estrategia: por qué, evidencia, beneficios, vacíos y riesgos.
 */
import type { EstrategiaRotacionDto } from "@agrocore/contracts";

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="font-semibold">{titulo}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function TarjetaEstrategia({ estrategia, mejor }: { estrategia: EstrategiaRotacionDto; mejor: boolean }) {
  return (
    <article className="space-y-3 rounded border border-slate-300 p-4">
      <h3 className="text-lg font-bold">
        Estrategia {estrategia.id} · {estrategia.nombre}
      </h3>
      {mejor && <p className="text-sm font-medium text-emerald-800">★ Mejor puntaje con tus prioridades</p>}
      <div>
        <h4 className="font-semibold">Por qué se sugiere</h4>
        <p className="text-sm">{estrategia.porQue}</p>
      </div>
      <Lista titulo="Evidencia" items={estrategia.evidencia} />
      <Lista titulo="Beneficios" items={estrategia.beneficios} />
      <Lista titulo="Lo que el sistema no sabe" items={estrategia.vaciosInformacion} />
      <Lista titulo="Riesgos para revisar con un agrónomo" items={estrategia.riesgos} />
    </article>
  );
}
