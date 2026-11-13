/**
 * Entidad Finca: identidad e invariantes de negocio. Sin dependencias técnicas.
 * Una finca puede estar en cualquier lugar del mundo y tener (opcionalmente) el polígono del lote.
 */
import { DomainError, Result } from "@agrocore/shared-kernel";
import type { PoligonoGeoJson } from "@agrocore/contracts";
import { NombreFinca } from "../value-objects/nombre-finca.vo.ts";
import { UbicacionFinca } from "../value-objects/ubicacion-finca.vo.ts";
import { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";
import { FincaYaInactivoError } from "../errors/finca.errors.ts";

export interface FincaProps {
  id: number | null;
  nombre: NombreFinca;
  descripcion: string | null;
  ubicacion: UbicacionFinca;
  /** Polígono del lote (null si la finca es solo un punto). */
  area: AreaSeleccionada | null;
  localidad: string | null;
  pais: string | null;
  region: string | null;
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
  localidad: string | null;
  pais: string | null;
  region: string | null;
  area: PoligonoGeoJson | null;
  areaHa: number | null;
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
  localidad?: string | null;
  pais?: string | null;
  region?: string | null;
  area?: PoligonoGeoJson | null;
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

    let area: AreaSeleccionada | null = null;
    if (datos.area) {
      const r = AreaSeleccionada.poligono(datos.area);
      if (!r.ok) return r;
      area = r.value;
    }

    return Result.ok(
      new Finca({
        id: null,
        nombre: nombre.value,
        descripcion: datos.descripcion ?? null,
        ubicacion: ubicacion.value,
        area,
        localidad: datos.localidad ?? null,
        pais: datos.pais ?? null,
        region: datos.region ?? null,
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
  get area(): AreaSeleccionada | null {
    return this.props.area;
  }
  get localidad(): string | null {
    return this.props.localidad;
  }
  get pais(): string | null {
    return this.props.pais;
  }
  get region(): string | null {
    return this.props.region;
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

  /** Lo que se analiza de la finca: su polígono si lo tiene; si no, su punto. */
  areaDeAnalisis(): AreaSeleccionada {
    if (this.props.area) return this.props.area;
    // La ubicación ya fue validada al crear la finca (UbicacionFinca).
    return AreaSeleccionada.puntoValidado(this.props.ubicacion.latitud, this.props.ubicacion.longitud);
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
      localidad: this.props.localidad,
      pais: this.props.pais,
      region: this.props.region,
      area: this.props.area?.toGeoJson() ?? null,
      areaHa: this.props.area?.areaHa ?? null,
      tieneRiego: this.props.tieneRiego,
      cultivoActual: this.props.cultivoActual,
      activo: this.props.activo,
      creadoEn: this.props.creadoEn ? this.props.creadoEn.toISOString() : null,
    };
  }
}
