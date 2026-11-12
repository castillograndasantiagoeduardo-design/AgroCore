/**
 * Entidad Cultivo: ficha agronómica de un cultivo del catálogo de Boyacá.
 * Su identidad es la `clave` (slug estable, ej. "papa"), no un id numérico.
 *
 * Invariantes que protege:
 *  1. Clave en minúsculas con letras y guion bajo; nombre no vacío; al menos una familia botánica.
 *  2. Ciclo, altitud y agua son rangos válidos (ver Rango).
 *  3. El rango de altitud ÓPTIMA está dentro del rango POSIBLE.
 *  4. Un cultivo que fija nitrógeno pertenece (al menos en parte) a las fabáceas (leguminosas).
 *  5. Tiene al menos una fuente: el sistema sugiere con evidencia, no con datos inventados.
 */
import { DomainError, Result } from "@duitamacrece/shared-kernel";
import type { AptitudAltitud, FamiliaBotanica, Nivel, UsoCultivo, ValorForrajero } from "@duitamacrece/contracts";
import { Rango } from "../value-objects/rango.vo.ts";
import { CultivoDatosInvalidosError } from "../errors/cultivo.errors.ts";

const PATRON_CLAVE = /^[a-z][a-z_]{1,39}$/;
const ORDEN_NIVEL: Record<Nivel, number> = { baja: 0, media: 1, alta: 2 };

/** Compara niveles cualitativos: nivelAlMenos("alta", "media") === true. */
export function nivelAlMenos(nivel: Nivel, minimo: Nivel): boolean {
  return ORDEN_NIVEL[nivel] >= ORDEN_NIVEL[minimo];
}

/** Datos planos con los que se crea un cultivo (los rangos como [min, max]). */
export interface CrearCultivoDatos {
  clave: string;
  nombre: string;
  nombreCientifico: string;
  familias: FamiliaBotanica[];
  uso: UsoCultivo;
  perenne: boolean;
  cicloDias: [number, number];
  altitudM: [number, number];
  altitudOptimaM: [number, number];
  toleranciaHelada: Nivel;
  necesidadAgua: Nivel;
  aguaCicloMm: [number, number];
  fijaNitrogeno: boolean;
  coberturaSuelo: Nivel;
  valorForrajero: ValorForrajero;
  notas: string[];
  fuentes: string[];
}

interface CultivoProps extends Omit<CrearCultivoDatos, "cicloDias" | "altitudM" | "altitudOptimaM" | "aguaCicloMm"> {
  cicloDias: Rango;
  altitudM: Rango;
  altitudOptimaM: Rango;
  aguaCicloMm: Rango;
}

export interface CultivoSnapshot {
  clave: string;
  nombre: string;
  nombreCientifico: string;
  familias: FamiliaBotanica[];
  uso: UsoCultivo;
  perenne: boolean;
  cicloDias: { min: number; max: number };
  altitudM: { min: number; max: number };
  altitudOptimaM: { min: number; max: number };
  toleranciaHelada: Nivel;
  necesidadAgua: Nivel;
  aguaCicloMm: { min: number; max: number };
  fijaNitrogeno: boolean;
  coberturaSuelo: Nivel;
  valorForrajero: ValorForrajero;
  notas: string[];
  fuentes: string[];
  aptitudAltitud?: AptitudAltitud;
}

export class Cultivo {
  private constructor(private readonly props: CultivoProps) {
    Object.freeze(this.props);
  }

  static crear(datos: CrearCultivoDatos): Result<Cultivo, DomainError> {
    const c = datos.clave;
    if (!PATRON_CLAVE.test(c)) return Result.err(new CultivoDatosInvalidosError(c, "la clave debe ser minúsculas y guion bajo"));
    if (datos.nombre.trim().length < 2) return Result.err(new CultivoDatosInvalidosError(c, "el nombre está vacío"));
    if (datos.familias.length === 0) return Result.err(new CultivoDatosInvalidosError(c, "no tiene familia botánica"));
    if (datos.fuentes.length === 0) return Result.err(new CultivoDatosInvalidosError(c, "no tiene fuentes"));
    if (datos.fijaNitrogeno && !datos.familias.includes("fabaceas")) {
      return Result.err(new CultivoDatosInvalidosError(c, "solo las leguminosas (fabáceas) fijan nitrógeno"));
    }

    const ciclo = Rango.crear(datos.cicloDias[0], datos.cicloDias[1], c, "cicloDias");
    if (!ciclo.ok) return ciclo;
    const altitud = Rango.crear(datos.altitudM[0], datos.altitudM[1], c, "altitudM");
    if (!altitud.ok) return altitud;
    const optima = Rango.crear(datos.altitudOptimaM[0], datos.altitudOptimaM[1], c, "altitudOptimaM");
    if (!optima.ok) return optima;
    const agua = Rango.crear(datos.aguaCicloMm[0], datos.aguaCicloMm[1], c, "aguaCicloMm");
    if (!agua.ok) return agua;

    if (!altitud.value.incluye(optima.value)) {
      return Result.err(new CultivoDatosInvalidosError(c, "la altitud óptima se sale del rango de altitud posible"));
    }

    return Result.ok(
      new Cultivo({
        ...datos,
        nombre: datos.nombre.trim(),
        familias: [...datos.familias],
        notas: [...datos.notas],
        fuentes: [...datos.fuentes],
        cicloDias: ciclo.value,
        altitudM: altitud.value,
        altitudOptimaM: optima.value,
        aguaCicloMm: agua.value,
      }),
    );
  }

  get clave(): string {
    return this.props.clave;
  }
  get nombre(): string {
    return this.props.nombre;
  }
  get familias(): readonly FamiliaBotanica[] {
    return this.props.familias;
  }
  get uso(): UsoCultivo {
    return this.props.uso;
  }
  get perenne(): boolean {
    return this.props.perenne;
  }
  get cicloDias(): Rango {
    return this.props.cicloDias;
  }
  get toleranciaHelada(): Nivel {
    return this.props.toleranciaHelada;
  }
  get necesidadAgua(): Nivel {
    return this.props.necesidadAgua;
  }
  get fijaNitrogeno(): boolean {
    return this.props.fijaNitrogeno;
  }
  get coberturaSuelo(): Nivel {
    return this.props.coberturaSuelo;
  }
  get valorForrajero(): ValorForrajero {
    return this.props.valorForrajero;
  }

  /** "optima" dentro del rango óptimo, "posible" dentro del rango general, "no_apta" fuera. */
  aptitudPorAltitud(altitudM: number): AptitudAltitud {
    if (this.props.altitudOptimaM.contiene(altitudM)) return "optima";
    if (this.props.altitudM.contiene(altitudM)) return "posible";
    return "no_apta";
  }

  perteneceAFamilia(familia: FamiliaBotanica): boolean {
    return this.props.familias.includes(familia);
  }

  /** true si comparte alguna familia con `otro` (base de "no sembrar la misma familia seguida"). */
  compartenFamilia(otro: Cultivo): boolean {
    return this.props.familias.some((f) => otro.perteneceAFamilia(f));
  }

  toSnapshot(aptitudAltitud?: AptitudAltitud): CultivoSnapshot {
    const p = this.props;
    return {
      clave: p.clave,
      nombre: p.nombre,
      nombreCientifico: p.nombreCientifico,
      familias: [...p.familias],
      uso: p.uso,
      perenne: p.perenne,
      cicloDias: p.cicloDias.toJSON(),
      altitudM: p.altitudM.toJSON(),
      altitudOptimaM: p.altitudOptimaM.toJSON(),
      toleranciaHelada: p.toleranciaHelada,
      necesidadAgua: p.necesidadAgua,
      aguaCicloMm: p.aguaCicloMm.toJSON(),
      fijaNitrogeno: p.fijaNitrogeno,
      coberturaSuelo: p.coberturaSuelo,
      valorForrajero: p.valorForrajero,
      notas: [...p.notas],
      fuentes: [...p.fuentes],
      ...(aptitudAltitud ? { aptitudAltitud } : {}),
    };
  }
}
