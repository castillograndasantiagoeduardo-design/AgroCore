/**
 * Entidad Cultivo: ficha agronómica de un cultivo del catálogo GLOBAL.
 * Su identidad es la `clave` (slug estable, ej. "papa"), no un id numérico.
 *
 * Invariantes que protege:
 *  1. Clave en minúsculas con letras y guion bajo; nombre no vacío; al menos una familia botánica y una textura.
 *  2. Ciclo, temperaturas, lluvia, agua y pH son rangos válidos (ver Rango).
 *  3. La temperatura ÓPTIMA está dentro de la ABSOLUTA (ECOCROP: TOPMN–TOPMX dentro de TMIN–TMAX).
 *  4. El pH óptimo está entre 3 y 10.
 *  5. Un cultivo que fija nitrógeno pertenece (al menos en parte) a las fabáceas (leguminosas).
 *  6. Tiene al menos una fuente: el sistema sugiere con evidencia, no con datos inventados.
 *  7. Cada valor que usa el motor declara su fuente (`fuentesValores`); lo que no tiene fuente va en
 *     `camposSinFuente` y NO se usa para decidir (ver `sinFuente`).
 */
import { DomainError, Result } from "@agrocore/shared-kernel";
import type {
  AptitudClima,
  DatoConFuente,
  FuenteDato,
  TipoDato,
  FamiliaBotanica,
  GrupoCultivo,
  Nivel,
  ProfundidadRaiz,
  TexturaSuelo,
  UsoCultivo,
  ValorForrajero,
} from "@agrocore/contracts";
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
  grupo: GrupoCultivo;
  perenne: boolean;
  cicloDias: [number, number];
  ocupaVariasTemporadas: boolean;
  temperaturaOptimaC: [number, number];
  temperaturaAbsolutaC: [number, number];
  lluviaAnualOptimaMm: [number, number];
  aguaCicloMm: [number, number];
  toleranciaHelada: Nivel;
  toleranciaCalor: Nivel;
  toleranciaSequia: Nivel;
  necesidadAgua: Nivel;
  phOptimo: [number, number];
  texturas: TexturaSuelo[];
  profundidadRaiz: ProfundidadRaiz;
  fijaNitrogeno: boolean;
  coberturaSuelo: Nivel;
  valorForrajero: ValorForrajero;
  notas: string[];
  fuentes: string[];
  /** Registros de FAO ECOCROP (EcoPortCode) y URL de la base usada. */
  ecocrop: { codigos: number[]; url: string };
  /** Fuente concreta de cada valor que usa el motor. */
  fuentesValores: { campo: string; fuente: FuenteDato; tipo: TipoDato; referencia: string }[];
  /** Campos sin fuente verificable: no se usan para decidir. */
  camposSinFuente: string[];
  /** Valor bruto de la producción por hectárea (FAOSTAT mundo); valor null = sin datos. */
  valorProduccionHa: DatoConFuente<number>;
}

type CamposRango = "cicloDias" | "temperaturaOptimaC" | "temperaturaAbsolutaC" | "lluviaAnualOptimaMm" | "aguaCicloMm" | "phOptimo";

interface CultivoProps extends Omit<CrearCultivoDatos, CamposRango> {
  cicloDias: Rango;
  temperaturaOptimaC: Rango;
  temperaturaAbsolutaC: Rango;
  lluviaAnualOptimaMm: Rango;
  aguaCicloMm: Rango;
  phOptimo: Rango;
}

type RangoJson = { min: number; max: number };

export interface CultivoSnapshot extends Omit<CrearCultivoDatos, CamposRango> {
  cicloDias: RangoJson;
  temperaturaOptimaC: RangoJson;
  temperaturaAbsolutaC: RangoJson;
  lluviaAnualOptimaMm: RangoJson;
  aguaCicloMm: RangoJson;
  phOptimo: RangoJson;
  aptitudClima?: AptitudClima;
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
    if (datos.texturas.length === 0) return Result.err(new CultivoDatosInvalidosError(c, "no tiene texturas de suelo"));
    if (datos.fuentes.length === 0) return Result.err(new CultivoDatosInvalidosError(c, "no tiene fuentes"));
    if (datos.fijaNitrogeno && !datos.familias.includes("fabaceas")) {
      return Result.err(new CultivoDatosInvalidosError(c, "solo las leguminosas (fabáceas) fijan nitrógeno"));
    }

    const rangos: Partial<Record<CamposRango, Rango>> = {};
    for (const campo of ["cicloDias", "lluviaAnualOptimaMm", "aguaCicloMm", "phOptimo"] as const) {
      const r = Rango.crear(datos[campo][0], datos[campo][1], c, campo);
      if (!r.ok) return r;
      rangos[campo] = r.value;
    }
    // Las temperaturas pueden ser negativas: se valida que sean finitas y ordenadas.
    for (const campo of ["temperaturaOptimaC", "temperaturaAbsolutaC"] as const) {
      const r = Rango.crearConNegativos(datos[campo][0], datos[campo][1], c, campo);
      if (!r.ok) return r;
      rangos[campo] = r.value;
    }
    if (!rangos.temperaturaAbsolutaC!.incluye(rangos.temperaturaOptimaC!)) {
      return Result.err(new CultivoDatosInvalidosError(c, "la temperatura óptima se sale del rango absoluto"));
    }
    if (rangos.phOptimo!.min < 3 || rangos.phOptimo!.max > 10) {
      return Result.err(new CultivoDatosInvalidosError(c, "el pH óptimo debe estar entre 3 y 10"));
    }

    return Result.ok(
      new Cultivo({
        ...datos,
        nombre: datos.nombre.trim(),
        familias: [...datos.familias],
        texturas: [...datos.texturas],
        fuentesValores: datos.fuentesValores.map((f) => ({ ...f })),
        camposSinFuente: [...datos.camposSinFuente],
        ecocrop: { codigos: [...datos.ecocrop.codigos], url: datos.ecocrop.url },
        valorProduccionHa: { ...datos.valorProduccionHa },
        notas: [...datos.notas],
        fuentes: [...datos.fuentes],
        cicloDias: rangos.cicloDias!,
        temperaturaOptimaC: rangos.temperaturaOptimaC!,
        temperaturaAbsolutaC: rangos.temperaturaAbsolutaC!,
        lluviaAnualOptimaMm: rangos.lluviaAnualOptimaMm!,
        aguaCicloMm: rangos.aguaCicloMm!,
        phOptimo: rangos.phOptimo!,
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
  get grupo(): GrupoCultivo {
    return this.props.grupo;
  }
  get perenne(): boolean {
    return this.props.perenne;
  }
  get cicloDias(): Rango {
    return this.props.cicloDias;
  }
  get ocupaVariasTemporadas(): boolean {
    return this.props.ocupaVariasTemporadas;
  }
  get temperaturaOptimaC(): Rango {
    return this.props.temperaturaOptimaC;
  }
  get temperaturaAbsolutaC(): Rango {
    return this.props.temperaturaAbsolutaC;
  }
  get aguaCicloMm(): Rango {
    return this.props.aguaCicloMm;
  }
  get lluviaAnualOptimaMm(): Rango {
    return this.props.lluviaAnualOptimaMm;
  }
  get toleranciaHelada(): Nivel {
    return this.props.toleranciaHelada;
  }
  get toleranciaCalor(): Nivel {
    return this.props.toleranciaCalor;
  }
  get toleranciaSequia(): Nivel {
    return this.props.toleranciaSequia;
  }
  get necesidadAgua(): Nivel {
    return this.props.necesidadAgua;
  }
  get phOptimo(): Rango {
    return this.props.phOptimo;
  }
  get texturas(): readonly TexturaSuelo[] {
    return this.props.texturas;
  }
  get profundidadRaiz(): ProfundidadRaiz {
    return this.props.profundidadRaiz;
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
  get fuentes(): readonly string[] {
    return this.props.fuentes;
  }
  get ecocrop(): { codigos: readonly number[]; url: string } {
    return this.props.ecocrop;
  }
  get fuentesValores(): CrearCultivoDatos["fuentesValores"] {
    return this.props.fuentesValores;
  }
  get camposSinFuente(): readonly string[] {
    return this.props.camposSinFuente;
  }
  get valorProduccionHa(): DatoConFuente<number> {
    return this.props.valorProduccionHa;
  }
  /** true si `campo` no tiene fuente verificable: el motor no lo usa para decidir. */
  sinFuente(campo: keyof CrearCultivoDatos): boolean {
    return this.props.camposSinFuente.includes(campo);
  }
  /** Referencia de la fuente de un campo ("FAO ECOCROP 1971: TOPMN-TOPMX"), o null si no tiene. */
  fuenteDe(campo: keyof CrearCultivoDatos): CrearCultivoDatos["fuentesValores"][number] | null {
    return this.props.fuentesValores.find((f) => f.campo === campo) ?? null;
  }
  /** true si es una cobertura o abono verde (se usa en intervalos y meses baldíos). */
  get esCobertura(): boolean {
    return this.props.uso === "cobertura" || this.props.grupo === "cobertura";
  }

  /** Meses que dura el ciclo medio (redondeado hacia arriba). */
  get mesesCicloMedio(): number {
    return Math.ceil((this.props.cicloDias.min + this.props.cicloDias.max) / 2 / 30);
  }

  /** "optima" dentro del rango óptimo de temperatura media, "posible" dentro del absoluto, "no_apta" fuera. */
  aptitudPorTemperatura(tempMediaC: number): AptitudClima {
    if (this.props.temperaturaOptimaC.contiene(tempMediaC)) return "optima";
    if (this.props.temperaturaAbsolutaC.contiene(tempMediaC)) return "posible";
    return "no_apta";
  }

  /** null si no se conoce el pH; true si está dentro del óptimo ± `tolerancia`. */
  phCompatible(ph: number | null, tolerancia = 0.5): boolean | null {
    if (ph === null) return null;
    return ph >= this.props.phOptimo.min - tolerancia && ph <= this.props.phOptimo.max + tolerancia;
  }

  /** null si no se conoce la textura del suelo o si las texturas del cultivo no tienen fuente (no se usan para decidir). */
  texturaCompatible(textura: TexturaSuelo | null): boolean | null {
    if (textura === null || this.sinFuente("texturas")) return null;
    return this.props.texturas.includes(textura);
  }

  /** Tolerancia a la helada, o null si FAO ECOCROP no trae temperatura letal (el motor no puede suponer un valor). */
  toleranciaHeladaConocida(): Nivel | null {
    return this.sinFuente("toleranciaHelada") ? null : this.props.toleranciaHelada;
  }

  /** Valor forrajero, o null si no tiene fuente (aporta 0 al puntaje). */
  valorForrajeroConocido(): ValorForrajero | null {
    return this.sinFuente("valorForrajero") ? null : this.props.valorForrajero;
  }

  /** Cobertura del suelo, o null si no tiene fuente (aporta 0 al puntaje). */
  coberturaConocida(): Nivel | null {
    return this.sinFuente("coberturaSuelo") ? null : this.props.coberturaSuelo;
  }

  /** true si algún campo que decide la viabilidad (temperatura, ciclo o agua del ciclo) no tiene fuente: el cultivo no es viable. */
  get sinDatosDeViabilidad(): boolean {
    return ["temperaturaOptimaC", "temperaturaAbsolutaC", "cicloDias", "aguaCicloMm"].some((c) => this.props.camposSinFuente.includes(c));
  }

  perteneceAFamilia(familia: FamiliaBotanica): boolean {
    return this.props.familias.includes(familia);
  }

  /** true si comparte alguna familia con `otro` (base de "no sembrar la misma familia seguida"). */
  compartenFamilia(otro: Cultivo): boolean {
    return this.props.familias.some((f) => otro.perteneceAFamilia(f));
  }

  toSnapshot(aptitudClima?: AptitudClima): CultivoSnapshot {
    const p = this.props;
    return {
      clave: p.clave,
      nombre: p.nombre,
      nombreCientifico: p.nombreCientifico,
      familias: [...p.familias],
      uso: p.uso,
      grupo: p.grupo,
      perenne: p.perenne,
      cicloDias: p.cicloDias.toJSON(),
      ocupaVariasTemporadas: p.ocupaVariasTemporadas,
      temperaturaOptimaC: p.temperaturaOptimaC.toJSON(),
      temperaturaAbsolutaC: p.temperaturaAbsolutaC.toJSON(),
      lluviaAnualOptimaMm: p.lluviaAnualOptimaMm.toJSON(),
      aguaCicloMm: p.aguaCicloMm.toJSON(),
      toleranciaHelada: p.toleranciaHelada,
      toleranciaCalor: p.toleranciaCalor,
      toleranciaSequia: p.toleranciaSequia,
      necesidadAgua: p.necesidadAgua,
      phOptimo: p.phOptimo.toJSON(),
      texturas: [...p.texturas],
      profundidadRaiz: p.profundidadRaiz,
      fijaNitrogeno: p.fijaNitrogeno,
      coberturaSuelo: p.coberturaSuelo,
      valorForrajero: p.valorForrajero,
      notas: [...p.notas],
      fuentes: [...p.fuentes],
      ecocrop: { codigos: [...p.ecocrop.codigos], url: p.ecocrop.url },
      fuentesValores: p.fuentesValores.map((f) => ({ ...f })),
      camposSinFuente: [...p.camposSinFuente],
      valorProduccionHa: { ...p.valorProduccionHa },
      ...(aptitudClima ? { aptitudClima } : {}),
    };
  }
}
