/**
 * Caso de uso: imprimir (o previsualizar) el ticket térmico de 58 mm con la recomendación del lugar.
 *
 *  1. Recalcula la etapa rápida de la recomendación (con la caché / precálculo: una sola fuente de verdad, la misma
 *     que ve el Frontend): aptitud, clima y qué sembrar en cada época para el objetivo elegido.
 *  2. Compone el ticket (dominio puro) con la fecha de IReloj.
 *  3. Si no es vista previa, lo envía a la impresora térmica (puerto IImpresoraTermica).
 *
 * No muta estado de negocio: no audita (Regla 6). Una impresora apagada o sin compartir devuelve
 * IMPRESORA_NO_DISPONIBLE (nunca una excepción).
 */
import { ANCHO_TICKET_58MM, type ImprimirTicketTerrenoInput, type ResultadoImpresionDto } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import { componerTicketRecomendacion, formatearFechaTicket } from "../../domain/services/componer-ticket.service.ts";
import type { ContextoSolicitud, IImpresoraTermica, IRecomendacionRapidaQuery, IReloj } from "../ports/index.ts";

export class ImprimirTicketTerrenoUseCase {
  constructor(
    private readonly recomendacion: IRecomendacionRapidaQuery,
    private readonly impresora: IImpresoraTermica,
    private readonly reloj: IReloj,
  ) {}

  async execute(input: ImprimirTicketTerrenoInput, contexto: ContextoSolicitud): Promise<Result<ResultadoImpresionDto, DomainError>> {
    const r = await this.recomendacion.execute(input, contexto);
    if (!r.ok) return r;

    const ancho = ANCHO_TICKET_58MM;
    const lineas = componerTicketRecomendacion({
      nombre: input.nombre ?? null,
      fecha: formatearFechaTicket(this.reloj.hoy()),
      rapida: r.value,
      objetivo: input.objetivo,
      ancho,
    });

    if (input.soloVistaPrevia) return Result.ok({ impreso: false, impresora: null, anchoCaracteres: ancho, lineas });

    const impreso = await this.impresora.imprimir(lineas);
    if (!impreso.ok) return impreso;
    return Result.ok({ impreso: true, impresora: impreso.value.impresora, anchoCaracteres: ancho, lineas });
  }
}
