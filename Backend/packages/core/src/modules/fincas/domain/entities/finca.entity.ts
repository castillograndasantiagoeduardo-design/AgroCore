/**
 * Entidad Finca: identidad e invariantes de negocio. Sin dependencias técnicas.
 */
import { DomainError, Result } from "@agrocore/shared-kernel";
import type { ZonaAltitudinal } from "@agrocore/contracts";
import { NombreFinca } from "../value-objects/nombre-finca.vo.ts";
import { UbicacionFinca } from "../value-objects/ubicacion-finca.vo.ts";
import { FincaYaInactivoError } from "../errors/finca.errors.ts";

export interface FincaProps {
  id: number | null;
  nombre: NombreFinca;
  descripcion: string | null;
  ubicacion: UbicacionFinca;
  vereda: string | null;
  tieneRiego: boolean;
  cultivoActual: string | null;
  activo: boolean;
  creadoEn: Date | null;
}

export interface FincaSnapshot {
  id: number | null;
  nombre: string;
  descripcion: string | null;
  latitud: number;
  longitud: number;
  altitudM: number | null;
  zonaAltitudinal: ZonaAltitudinal | null;
  vereda: string | null;
  tieneRiego: boolean;
  cultivoActual: string | null;
  activo: boolean;
  creadoEn: string | null;
}

export interface CrearFincaDatos {
  nombre: string;
  descripcion?: string | null;
  latitud: number;
  longitud: number;
  altitudM?: number | null;
  vereda?: string | null;
  tieneRiego?: boolean;
  cultivoActual?: string | null;
}

export class Finca {
  private constructor(private readonly props: FincaProps) {}

  static crear(datos: CrearFincaDatos): Result<Finca, DomainError> {
    const nombre = NombreFinca.crear(datos.nombre);
    if (!nombre.ok) return nombre;

    const ubicacion = UbicacionFinca.crear(datos);
    if (!ubicacion.ok) return ubicacion;

    return Result.ok(
      new Finca({
        id: null,
        nombre: nombre.value,
        descripcion: datos.descripcion ?? null,
        ubicacion: ubicacion.value,
        vereda: datos.vereda ?? null,
        tieneRiego: datos.tieneRiego ?? false,
        cultivoActual: datos.cultivoActual ?? null,
        activo: true,
        creadoEn: null,
      }),
    );
  }

  static reconstruir(props: FincaProps): Finca {
    return new Finca(props);
  }

  get id(): number | null {
    return this.props.id;
  }
  get nombre(): string {
    return this.props.nombre.value;
  }
  get descripcion(): string | null {
    return this.props.descripcion;
  }
  get ubicacion(): UbicacionFinca {
    return this.props.ubicacion;
  }
  get vereda(): string | null {
    return this.props.vereda;
  }
  get tieneRiego(): boolean {
    return this.props.tieneRiego;
  }
  get cultivoActual(): string | null {
    return this.props.cultivoActual;
  }
  get activo(): boolean {
    return this.props.activo;
  }

  desactivar(): Result<void, DomainError> {
    if (!this.props.activo) return Result.err(new FincaYaInactivoError(this.props.id));
    this.props.activo = false;
    return Result.ok(undefined);
  }

  toSnapshot(): FincaSnapshot {
    const u = this.props.ubicacion;
    return {
      id: this.props.id,
      nombre: this.props.nombre.value,
      descripcion: this.props.descripcion,
      latitud: u.latitud,
      longitud: u.longitud,
      altitudM: u.altitudM,
      zonaAltitudinal: u.zona,
      vereda: this.props.vereda,
      tieneRiego: this.props.tieneRiego,
      cultivoActual: this.props.cultivoActual,
      activo: this.props.activo,
      creadoEn: this.props.creadoEn ? this.props.creadoEn.toISOString() : null,
    };
  }
}
