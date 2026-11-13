/**
 * Puertos del módulo recomendacion (recomendación por época del año).
 */
import type { DomainError, Result } from "@agrocore/shared-kernel";

export type { ContextoSolicitud } from "../../../auditoria/application/ports/auditor.port.ts";
export type { ICultivoRepository } from "../../../cultivos/domain/repositories/cultivo.repository.ts";
export type { ITemporizador } from "../../../../shared/application/ports/temporizador.port.ts";
export type { IMedidorTiempos } from "../../../../shared/application/ports/medidor-tiempos.port.ts";

/**
 * Presencia local de los cultivos del catálogo alrededor de un punto.
 *   Colombia: Evaluaciones Agropecuarias Municipales (EVA, datos.gov.co) en los municipios cuyo centroide (DIVIPOLA)
 *             está a menos de RADIO_ZONA_KM del punto.
 *   Resto del mundo: FAOSTAT, área cosechada del país (Natural Earth para saber el país).
 */
export interface PresenciaLocal {
  fuente: "EVA" | "FAOSTAT";
  /** "Duitama y 8 municipios a menos de 25 km" o "Kenia". */
  ambito: string;
  /** "2015-2025" (EVA) o "2018-2022" (FAOSTAT). */
  periodo: string;
  /** Área sembrada (EVA) o cosechada (FAOSTAT) en hectáreas por clave del catálogo. Clave ausente = no se siembra en la zona. */
  areaPorCultivo: Record<string, number>;
  /** Claves del catálogo que la fuente puede reportar. Un cultivo fuera de esta lista tiene presencia "sin_datos". */
  cultivosCubiertos: string[];
  /** Valor bruto de la producción por hectárea en el PAÍS (FAOSTAT, I$ constantes 2014-2016) por clave, si existe. */
  valorProduccionHaPais: Record<string, number>;
  /** Nombre del país del punto (para rotular el valor). */
  pais: string | null;
  nota?: string;
}

export interface IPresenciaLocalProvider {
  /** null = no hay fuente de presencia para ese lugar (mar, país sin datos). Result.err = la fuente no respondió. */
  obtenerPresencia(latitud: number, longitud: number): Promise<Result<PresenciaLocal | null, DomainError>>;
}

/** Radio de la "zona" alrededor del punto para EVA (criterio del sistema, documentado en MODULE.md). */
export const RADIO_ZONA_KM = 25;
