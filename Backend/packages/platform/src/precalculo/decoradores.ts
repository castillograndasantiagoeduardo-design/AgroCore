/**
 * Decoradores "regional o en vivo": si el proveedor regional (MySQL, precálculo) cubre la consulta lo usan;
 * si no cubre, o falla, usan el proveedor en vivo. Así dentro de la región precalculada la etapa rápida no llama
 * a ningún servicio externo, y fuera de ella el flujo es el de siempre.
 *
 * Definen sus propias interfaces mínimas (`cubre`): platform no importa database; el contenedor las une.
 */
import type {
  ElementosOsm,
  ElevacionPuntos,
  IClimaProvider,
  ICoberturaProvider,
  IElevacionProvider,
  IViasProvider,
  CoberturaModis,
  LatLon,
  SerieClimatica,
} from "@agrocore/core";
import type { DomainError, Result } from "@agrocore/shared-kernel";

type Caja = readonly [number, number, number, number];

export interface IViasRegional extends IViasProvider {
  cubre(caja: Caja): Promise<boolean>;
}
export interface ICoberturaRegional extends ICoberturaProvider {
  cubre(latitud: number, longitud: number): Promise<boolean>;
}
export interface IElevacionRegional extends IElevacionProvider {
  cubre(puntos: readonly LatLon[]): Promise<boolean>;
}
export interface IClimaRegional extends IClimaProvider {
  cubre(latitud: number, longitud: number, desde: string, hasta: string): Promise<boolean>;
}

/** cubre() nunca debe tumbar la consulta: si lanza, se usa el proveedor en vivo. */
async function cubreSeguro(consulta: () => Promise<boolean>): Promise<boolean> {
  try {
    return await consulta();
  } catch {
    return false;
  }
}

export class ViasRegionalOVivo implements IViasProvider {
  constructor(private readonly regional: IViasRegional, private readonly vivo: IViasProvider) {}

  async obtenerElementos(caja: Caja): Promise<Result<ElementosOsm, DomainError>> {
    if (await cubreSeguro(() => this.regional.cubre(caja))) {
      const r = await this.regional.obtenerElementos(caja);
      if (r.ok) return r;
    }
    return await this.vivo.obtenerElementos(caja);
  }
}

export class CoberturaRegionalOVivo implements ICoberturaProvider {
  constructor(private readonly regional: ICoberturaRegional, private readonly vivo: ICoberturaProvider) {}

  async obtenerCobertura(latitud: number, longitud: number): Promise<Result<CoberturaModis | null, DomainError>> {
    if (await cubreSeguro(() => this.regional.cubre(latitud, longitud))) {
      const r = await this.regional.obtenerCobertura(latitud, longitud);
      if (r.ok) return r;
    }
    return await this.vivo.obtenerCobertura(latitud, longitud);
  }
}

/**
 * La grilla regional (0,01°, ~1 km) sirve para UN punto (altitud del lugar). Con varios puntos (relieve y
 * pendiente del terreno, separados decenas de metros) la grilla daría pendiente 0: ahí se usa siempre el servicio en vivo.
 */
export class ElevacionRegionalOVivo implements IElevacionProvider {
  constructor(private readonly regional: IElevacionRegional, private readonly vivo: IElevacionProvider) {}

  async obtenerElevaciones(puntos: readonly LatLon[]): Promise<Result<ElevacionPuntos, DomainError>> {
    if (puntos.length === 1 && await cubreSeguro(() => this.regional.cubre(puntos))) {
      const r = await this.regional.obtenerElevaciones(puntos);
      if (r.ok && r.value.elevacionesM[0] !== null) return r;
    }
    return await this.vivo.obtenerElevaciones(puntos);
  }
}

export class ClimaPrecalculadoOVivo implements IClimaProvider {
  constructor(private readonly precalculado: IClimaRegional, private readonly vivo: IClimaProvider) {}

  async obtenerSerieDiaria(consulta: { latitud: number; longitud: number; desde: string; hasta: string }): Promise<
    Result<SerieClimatica, DomainError>
  > {
    if (await cubreSeguro(() => this.precalculado.cubre(consulta.latitud, consulta.longitud, consulta.desde, consulta.hasta))) {
      const r = await this.precalculado.obtenerSerieDiaria(consulta);
      if (r.ok) return r;
    }
    return await this.vivo.obtenerSerieDiaria(consulta);
  }
}
