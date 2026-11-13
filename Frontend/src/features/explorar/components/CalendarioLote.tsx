"use client";

/**
 * Calendario Agrícola Descriptivo y Accesible:
 * Explica mes a mes en lenguaje claro qué labor realizar (Preparación, Siembra, Cuidado, Cosecha o Descanso)
 * según la estrategia del objetivo seleccionado, sin tecnicismos ni barras crípticas.
 */
import { useState } from "react";
import type { EstrategiaRotacionDto, MesCalendarioDto, PasoRotacionDto } from "@agrocore/contracts";
import { IconoAlerta, IconoCalendario, IconoCheck, IconoHoja, IconoSol } from "@/components/ui/Iconos";
import { nombreMesCapital } from "../types/explorar.types";

interface Props {
  calendario: MesCalendarioDto[];
  estrategia?: EstrategiaRotacionDto;
  objetivoNombre?: string;
}

type EtapaAgricola = "preparacion" | "siembra" | "cuidado" | "cosecha" | "descanso";

interface AccionMes {
  etapa: EtapaAgricola;
  etiquetaEtapa: string;
  cultivo: string | null;
  instruccion: string;
  condicionClimatica: string;
  alertaPractica: string | null;
}

const ESTILO_ETAPA: Record<EtapaAgricola, { badge: string; borde: string; fondo: string }> = {
  preparacion: {
    badge: "bg-amber-100 text-amber-900",
    borde: "border-amber-200",
    fondo: "bg-amber-50/40",
  },
  siembra: {
    badge: "bg-emerald-600 text-white",
    borde: "border-emerald-300",
    fondo: "bg-emerald-50/60",
  },
  cuidado: {
    badge: "bg-sky-100 text-sky-900",
    borde: "border-sky-200",
    fondo: "bg-sky-50/35",
  },
  cosecha: {
    badge: "bg-teal-700 text-white",
    borde: "border-teal-300",
    fondo: "bg-teal-50/50",
  },
  descanso: {
    badge: "bg-slate-200 text-slate-700",
    borde: "border-slate-200",
    fondo: "bg-slate-50/60",
  },
};

function mesAnterior(mes: number): number {
  return mes === 1 ? 12 : mes - 1;
}

function describirCondicion(m: MesCalendarioDto): { condicion: string; alerta: string | null } {
  const amenazas = m.vulnerabilidad.amenazas;
  const helada = amenazas.find((a) => a.tipo === "helada");
  const sequia = amenazas.find((a) => a.tipo === "deficit_hidrico");
  const calor = amenazas.find((a) => a.tipo === "calor");
  const lluvia = amenazas.find((a) => a.tipo === "lluvia_extrema");

  const condicion = m.enTemporada ? "Época favorable de humedad" : "Época de menor lluvia";

  if (helada) {
    return {
      condicion,
      alerta: "Riesgo de madrugadas frías o helada: conservar cobertura húmeda en el suelo.",
    };
  }
  if (lluvia) {
    return {
      condicion,
      alerta: "Lluvias intensas probables: mantener zanjas y drenajes despejados.",
    };
  }
  if (sequia) {
    return {
      condicion,
      alerta: "Mes seco: proteger el suelo con rastrojo para evitar que pierda humedad.",
    };
  }
  if (calor) {
    return {
      condicion,
      alerta: "Días calurosos: regar o realizar labores temprano en la mañana.",
    };
  }
  return { condicion, alerta: null };
}

function construirAccionMes(
  m: MesCalendarioDto,
  pasosAnio: PasoRotacionDto[],
): AccionMes {
  const { condicion, alerta } = describirCondicion(m);
  const pasosCultivo = pasosAnio.filter((p) => p.cultivoClave !== "barbecho");

  const pasoSiembra = pasosCultivo.find((p) => p.mesSiembra === m.mes && !p.continua);
  if (pasoSiembra) {
    return {
      etapa: "siembra",
      etiquetaEtapa: "Siembra",
      cultivo: pasoSiembra.cultivoNombre,
      instruccion: `Sembrar ${pasoSiembra.cultivoNombre} aprovechando la humedad de inicio de temporada. Asegurar buena distancia entre plantas.`,
      condicionClimatica: condicion,
      alertaPractica: alerta,
    };
  }

  const pasoCosecha = pasosCultivo.find((p) => p.mesCosecha === m.mes);
  if (pasoCosecha) {
    return {
      etapa: "cosecha",
      etiquetaEtapa: "Cosecha",
      cultivo: pasoCosecha.cultivoNombre,
      instruccion: `Recolectar ${pasoCosecha.cultivoNombre} y dejar los restos sanos sobre el lote para alimentar y proteger la tierra.`,
      condicionClimatica: condicion,
      alertaPractica: alerta,
    };
  }

  const pasoCuidado = pasosCultivo.find((p) => p.mesesCiclo.includes(m.mes));
  if (pasoCuidado) {
    return {
      etapa: "cuidado",
      etiquetaEtapa: "Cuidado del cultivo",
      cultivo: pasoCuidado.cultivoNombre,
      instruccion: `Seguimiento de ${pasoCuidado.cultivoNombre}: revisión de hojas, control oportuno de malezas y mantenimiento de la humedad.`,
      condicionClimatica: condicion,
      alertaPractica: alerta,
    };
  }

  const pasoPrep = pasosCultivo.find((p) => mesAnterior(p.mesSiembra) === m.mes && !p.continua);
  if (pasoPrep) {
    return {
      etapa: "preparacion",
      etiquetaEtapa: "Preparación",
      cultivo: pasoPrep.cultivoNombre,
      instruccion: `Alistar el terreno con labranza suave, revisar drenajes e incorporar abono orgánico antes de sembrar ${pasoPrep.cultivoNombre}.`,
      condicionClimatica: condicion,
      alertaPractica: alerta,
    };
  }

  return {
    etapa: "descanso",
    etiquetaEtapa: "Descanso y cobertura",
    cultivo: null,
    instruccion: m.baldio
      ? "Cubrir el lote con abono verde o rastrojo para que la tierra no quede descubierta y conserve nutrientes."
      : "Mantener cobertura vegetal ligera y permitir que el suelo recupere nutrientes antes de la próxima preparación.",
    condicionClimatica: condicion,
    alertaPractica: alerta,
  };
}

export function CalendarioLote({ calendario, estrategia, objetivoNombre }: Props) {
  const [anioSeleccionado, setAnioSeleccionado] = useState<1 | 2>(1);
  const meses = [...calendario].sort((a, b) => a.mes - b.mes);

  const pasosAnio = estrategia
    ? estrategia.secuencia.filter((p) => p.anio === anioSeleccionado)
    : [];

  return (
    <section
      aria-labelledby="calendario-lote"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
              <IconoCalendario width={18} height={18} />
            </span>
            <div>
              <h2 id="calendario-lote" className="text-lg font-bold text-slate-900">
                Calendario agrícola paso a paso
              </h2>
              <p className="text-xs text-slate-500">
                Qué hacer en cada mes del año {objetivoNombre ? `según tu objetivo «${objetivoNombre}»` : "en tu terreno"}
              </p>
            </div>
          </div>
        </div>

        {estrategia && (
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setAnioSeleccionado(1)}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                anioSeleccionado === 1 ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Año 1 de rotación
            </button>
            <button
              type="button"
              onClick={() => setAnioSeleccionado(2)}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                anioSeleccionado === 2 ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Año 2 de rotación
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900">
          Preparación del suelo
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 font-medium text-white">
          Siembra
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-900">
          Cuidado del cultivo
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-2.5 py-1 font-medium text-white">
          Cosecha
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-1 font-medium text-slate-700">
          Descanso y cobertura
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="list" aria-label="Actividades mes a mes">
        {meses.map((m) => {
          const accion = construirAccionMes(m, pasosAnio);
          const estilo = ESTILO_ETAPA[accion.etapa];
          return (
            <article
              key={m.mes}
              role="listitem"
              className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${estilo.borde} ${estilo.fondo}`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">{nombreMesCapital(m.mes)}</h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${estilo.badge}`}>
                    {accion.etiquetaEtapa}
                  </span>
                </div>

                {accion.cultivo && (
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-900">
                    <IconoHoja width={13} height={13} />
                    <span>{accion.cultivo}</span>
                  </p>
                )}

                <p className="text-xs leading-relaxed text-slate-700">{accion.instruccion}</p>
              </div>

              <div className="mt-3 space-y-1 pt-2 text-[11px] text-slate-600">
                <p className="flex items-center gap-1 font-medium">
                  {m.enTemporada ? (
                    <IconoCheck width={13} height={13} className="shrink-0 text-emerald-700" />
                  ) : (
                    <IconoSol width={13} height={13} className="shrink-0 text-amber-600" />
                  )}
                  <span>{accion.condicionClimatica}</span>
                </p>
                {accion.alertaPractica && (
                  <p className="flex items-start gap-1 text-amber-800">
                    <IconoAlerta width={13} height={13} className="mt-0.5 shrink-0 text-amber-700" />
                    <span>{accion.alertaPractica}</span>
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
