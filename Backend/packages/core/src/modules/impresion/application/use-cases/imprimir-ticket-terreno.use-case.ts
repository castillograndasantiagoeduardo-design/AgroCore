/**
 * Caso de uso: imprimir (o previsualizar) el ticket térmico con el resumen del terreno seleccionado.
 *
 *  1. Valida el área.
 *  2. Recalcula el análisis del terreno y, si el sitio es apto, la comparación de rotaciones (con la caché de
 *     los proveedores: una sola fuente de verdad, la misma que ve el Frontend).
 *  3. Compone el ticket (dominio puro) con la fecha de IReloj.
 *  4. Si no es vista previa, lo envía a la impresora térmica (puerto IImpresoraTermica).
 *
 * No muta estado de negocio, así que no audita (Regla 6). Una impresora apagada o sin compartir devuelve
 * IMPRESORA_NO_DISPONIBLE (nunca una excepción).
 */
import { ANCHO_TICKET_58MM, type ImprimirTicketTerrenoInput, type ResultadoImpresionDto } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";
import { componerTicketTerreno, formatearFechaTicket } from "../../domain/services/componer-ticket.service.ts";
import type { ContextoSolicitud, IAnalisisTerrenoQuery, IComparacionRotacionesQuery, IImpresoraTermica, IReloj } from "../ports/index.ts";

export class ImprimirTicketTerrenoUseCase {
  constructor(
    private readonly terreno: IAnalisisTerrenoQuery,
    private readonly rotaciones: IComparacionRotacionesQuery,
    private readonly impresora: IImpresoraTermica,
    private readonly reloj: IReloj,
  ) {}

  async execute(input: ImprimirTicketTerrenoInput, contexto: ContextoSolicitud): Promise<Result<ResultadoImpresionDto, DomainError>> {
    const area = AreaSeleccionada.desdeDto(input.area);
    if (!area.ok) return area;

    const terreno = await this.terreno.analizar(area.value);
    let comparacion = null;
    if (terreno.aptitud === "apto") {
      const r = await this.rotaciones.execute(input, contexto);
      if (!r.ok) return r;
      comparacion = r.value;
    }

    const ancho = ANCHO_TICKET_58MM;
    const lineas = componerTicketTerreno({
      nombre: input.nombre ?? null,
      fecha: formatearFechaTicket(this.reloj.hoy()),
      terreno,
      comparacion,
      ancho,
    });

    if (input.soloVistaPrevia) return Result.ok({ impreso: false, impresora: null, anchoCaracteres: ancho, lineas });

    const impreso = await this.impresora.imprimir(lineas);
    if (!impreso.ok) return impreso;
    return Result.ok({ impreso: true, impresora: impreso.value.impresora, anchoCaracteres: ancho, lineas });
  }
}
