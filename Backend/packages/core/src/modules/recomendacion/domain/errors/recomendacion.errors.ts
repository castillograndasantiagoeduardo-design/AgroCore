/**
 * Errores del módulo recomendacion.
 */
import { DomainError } from "@agrocore/shared-kernel";

/** La fuente de presencia local (EVA o FAOSTAT) no respondió. La recomendación sigue, sin preferir cultivos locales. */
export class PresenciaLocalNoDisponibleError extends DomainError {
  constructor(fuente: string, detalle: string) {
    super("PRESENCIA_LOCAL_NO_DISPONIBLE", "No se pudo consultar " + fuente + ": " + detalle + ".");
  }
}

/** El clima del lugar no permite derivar épocas (sin datos de NASA POWER). */
export class RecomendacionSinClimaError extends DomainError {
  constructor(detalle: string) {
    super("RECOMENDACION_SIN_CLIMA", "No hay datos de clima para este lugar: " + detalle + ".");
  }
}
