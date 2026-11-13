/**
 * Caso de uso: comparar estrategias de rotación de 2 años para una FINCA GUARDADA.
 * Usa el polígono de la finca (o su punto), su altitud, su riego y su cultivo actual; delega en MotorRotaciones.
 * Solo lectura: no muta estado, así que no audita (Regla 6).
 */
import type { ComparacionRotacionesDto, CompararRotacionesInput } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import { FincaNoEncontradoError } from "../../../fincas/domain/errors/finca.errors.ts";
import { RotacionCultivoActualRequeridoError } from "../../domain/errors/rotacion.errors.ts";
import type { ContextoSolicitud, IFincaRepository } from "../ports/index.ts";
import type { MotorRotaciones } from "./motor-rotaciones.ts";

export class CompararRotacionesUseCase {
  constructor(
    private readonly fincas: IFincaRepository,
    private readonly motor: MotorRotaciones,
  ) {}

  async execute(input: CompararRotacionesInput, contexto: ContextoSolicitud): Promise<Result<ComparacionRotacionesDto, DomainError>> {
    const finca = await this.fincas.buscarPorId(input.fincaId);
    if (!finca) return Result.err(new FincaNoEncontradoError(input.fincaId));

    const cultivoActual = input.secuenciaActual?.[0] ?? finca.cultivoActual;
    if (!cultivoActual) return Result.err(new RotacionCultivoActualRequeridoError(input.fincaId));

    return await this.motor.comparar(
      {
        area: finca.areaDeAnalisis(),
        sitio: { tipo: "finca", fincaId: input.fincaId, nombre: finca.nombre },
        altitudM: finca.ubicacion.altitudM,
        fuenteAltitud: finca.ubicacion.altitudM === null ? null : "finca",
        tieneRiego: finca.tieneRiego,
        cultivoActual,
        secuenciaActual: input.secuenciaActual,
        prioridades: input.prioridades,
      },
      contexto,
    );
  }
}
