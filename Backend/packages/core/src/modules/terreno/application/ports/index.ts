/**
 * Puertos del módulo terreno. Los implementan adaptadores de @agrocore/platform.
 *
 * Contrato común: si el servicio externo falla (red, timeout, HTTP 5xx, respuesta inválida), el
 * adaptador devuelve Result.err(TerrenoProveedorNoDisponibleError) — nunca lanza. El caso de uso
 * convierte ese error en una advertencia y un vacío de información: un proveedor caído NUNCA
 * produce un 500 ni impide el análisis.
 */
import type { DomainError, Result } from "@agrocore/shared-kernel";
import type { HumedadSueloMensualDto, SueloDto } from "@agrocore/contracts";
import type { LatLon } from "../../../../shared/domain/geo/geometria.ts";

export type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";
export type { IReloj } from "../../../clima/application/ports/index.ts";

/** Una vía de OpenStreetMap: highway=* y su eje como polilínea [lat, lon]. */
export interface ViaOsm {
  tipo: string;
  nombre: string | null;
  geometria: LatLon[];
}

/** Geometrías de OpenStreetMap en una caja. El adaptador solo entrega geometrías: la decisión es del dominio. */
export interface ElementosOsm {
  vias: ViaOsm[];
  /** Anillos [lat, lon] de edificaciones (building=*). */
  edificaciones: LatLon[][];
  /** Anillos [lat, lon] de cuerpos de agua (natural=water, landuse=reservoir/basin). */
  aguaPoligonos: LatLon[][];
  /** Ejes de ríos y canales (waterway=river|canal) con su tipo. */
  aguaLineas: { tipo: string; geometria: LatLon[] }[];
  fuente: string;
}

export interface IViasProvider {
  /** caja = [sur, oeste, norte, este] en grados. */
  obtenerElementos(caja: readonly [number, number, number, number]): Promise<Result<ElementosOsm, DomainError>>;
}

export interface CoberturaModis {
  /** Clase IGBP (LC_Type1) 1–17. */
  claseIgbp: number;
  anio: number;
  fuente: string;
}

export interface ICoberturaProvider {
  /** Cobertura del último año disponible en la celda; null si el producto no tiene dato ahí. */
  obtenerCobertura(latitud: number, longitud: number): Promise<Result<CoberturaModis | null, DomainError>>;
}

export interface SerieNdvi {
  fuente: string;
  /** Muestras válidas (sin relleno), fecha YYYY-MM-DD y NDVI −1..1 ya escalado. */
  muestras: { fecha: string; ndvi: number }[];
}

export interface INdviProvider {
  /** desde/hasta en YYYY-MM-DD. */
  obtenerSerie(latitud: number, longitud: number, desde: string, hasta: string): Promise<Result<SerieNdvi, DomainError>>;
}

export interface ISueloProvider {
  /** Propiedades de 0–30 cm; null si el servicio no tiene dato en ese punto. */
  obtenerPropiedades(latitud: number, longitud: number): Promise<Result<SueloDto | null, DomainError>>;
}

export interface ElevacionPuntos {
  fuente: string;
  /** Una elevación (m) por punto pedido, en el mismo orden; null si no hay dato. */
  elevacionesM: (number | null)[];
}

export interface IElevacionProvider {
  obtenerElevaciones(puntos: readonly LatLon[]): Promise<Result<ElevacionPuntos, DomainError>>;
}

export interface HumedadSueloClimatologia {
  fuente: string;
  meses: HumedadSueloMensualDto[];
}

export interface IHumedadSueloProvider {
  obtenerClimatologia(latitud: number, longitud: number): Promise<Result<HumedadSueloClimatologia, DomainError>>;
}
