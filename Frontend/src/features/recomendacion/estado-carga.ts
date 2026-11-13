/**
 * Estado de la carga de una recomendación (máquina de estados PURA, sin React ni red).
 *
 * Garantías (fase 2.7, "que nunca se quede trabado"):
 *   - La carga SIEMPRE termina en: resultado completo, resultado parcial (llegó la etapa rápida pero no el detalle)
 *     o error con "Reintentar". Nunca queda "cargando" cuando el flujo terminó o se cortó.
 *   - A los 30 s sin terminar, `tardando = true` ("Esto está tardando más de lo normal": Seguir esperando / Cancelar).
 *   - Cancelar o cambiar de punto vuelve a "inactivo" y descarta los eventos tardíos de la petición anterior (`id`).
 */
import type {
  DatoConFuente,
  EventoRecomendacionDto,
  PasoCargaDto,
  PasoCargaId,
  RecomendacionDetalleDto,
  RecomendacionRapidaDto,
} from "@agrocore/contracts";

export const VIGILANTE_MS = 30_000;

export type FaseCarga = "inactivo" | "cargando" | "rapida_lista" | "completo" | "parcial" | "error";

export interface EstadoCarga {
  /** Identificador de la petición en curso: los eventos de otra petición se ignoran. */
  id: number;
  fase: FaseCarga;
  pasos: Partial<Record<PasoCargaId, PasoCargaDto>>;
  /** Datos verdaderos del lugar que ya llegaron (se muestran mientras espera). */
  datos: { etiqueta: string; dato: DatoConFuente<number> }[];
  rapida: RecomendacionRapidaDto | null;
  detalle: RecomendacionDetalleDto | null;
  error: { code: string; message: string } | null;
  errorDetalle: { code: string; message: string } | null;
  tardando: boolean;
}

export type AccionCarga =
  | { tipo: "iniciar"; id: number }
  | { tipo: "evento"; id: number; evento: EventoRecomendacionDto }
  /** El flujo NDJSON terminó (bien o cortado) sin más eventos. */
  | { tipo: "cerrado"; id: number }
  | { tipo: "fallo_red"; id: number; mensaje: string }
  | { tipo: "vigilante"; id: number }
  | { tipo: "seguir_esperando"; id: number }
  | { tipo: "cancelar" };

export const ESTADO_INICIAL: EstadoCarga = {
  id: 0,
  fase: "inactivo",
  pasos: {},
  datos: [],
  rapida: null,
  detalle: null,
  error: null,
  errorDetalle: null,
  tardando: false,
};

/** ¿Sigue cargando algo que el usuario está esperando? (para el vigilante y el aria-busy). */
export const estaCargando = (e: EstadoCarga) => e.fase === "cargando" || e.fase === "rapida_lista";

/** Cierra la carga: con detalle → completo; solo con la rápida → parcial; sin nada → error. */
function terminar(e: EstadoCarga): EstadoCarga {
  if (!estaCargando(e)) return e;
  if (e.rapida && e.detalle) return { ...e, fase: "completo", tardando: false };
  if (e.rapida) return { ...e, fase: "parcial", tardando: false };
  return {
    ...e,
    fase: "error",
    tardando: false,
    error: e.error ?? { code: "SIN_RESPUESTA", message: "No llegó la respuesta del servidor. Revise la conexión y vuelva a intentarlo." },
  };
}

export function reducirCarga(e: EstadoCarga, a: AccionCarga): EstadoCarga {
  if (a.tipo === "iniciar") return { ...ESTADO_INICIAL, id: a.id, fase: "cargando" };
  if (a.tipo === "cancelar") return { ...ESTADO_INICIAL, id: e.id + 1 };
  if (a.id !== e.id) return e; // evento de una petición vieja
  switch (a.tipo) {
    case "vigilante":
      return estaCargando(e) ? { ...e, tardando: true } : e;
    case "seguir_esperando":
      return { ...e, tardando: false };
    case "fallo_red":
      return terminar({ ...e, error: e.error ?? { code: "RED_NO_DISPONIBLE", message: a.mensaje } });
    case "cerrado":
      return terminar(e);
    case "evento": {
      const ev = a.evento;
      if (!estaCargando(e)) return e;
      switch (ev.tipo) {
        case "paso":
          return { ...e, pasos: { ...e.pasos, [ev.paso.id]: ev.paso } };
        case "dato":
          return { ...e, datos: [...e.datos.filter((d) => d.etiqueta !== ev.etiqueta), { etiqueta: ev.etiqueta, dato: ev.dato }] };
        case "rapida": {
          const conRapida = { ...e, rapida: ev.datos };
          return conRapida.detalle ? { ...conRapida, fase: "completo", tardando: false } : { ...conRapida, fase: "rapida_lista" };
        }
        case "detalle": {
          const conDetalle = { ...e, detalle: ev.datos };
          return conDetalle.rapida ? { ...conDetalle, fase: "completo", tardando: false } : conDetalle;
        }
        case "error":
          return ev.etapa === "rapida" ? { ...e, error: ev.error } : { ...e, errorDetalle: ev.error };
        case "fin":
          return terminar(e);
      }
    }
  }
  return e;
}
