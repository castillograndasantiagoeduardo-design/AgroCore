/**
 * Caso de uso: comparar estrategias de rotación para CUALQUIER punto o área del mundo.
 * Valida el área (≤ 100 ha) y delega en MotorRotaciones.
 * Solo lectura: no muta estado, así que no audita (Regla 6).
 */
import type { ComparacionRotacionesDto, CompararRotacionesUbicacionInput } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";
import type { ContextoSolicitud } from "../ports/index.ts";
import type { MotorRotaciones } from "./motor-rotaciones.ts";

export class CompararRotacionesUbicacionUseCase {
  constructor(private readonly motor: MotorRotaciones) {}

  async execute(input: CompararRotacionesUbicacionInput, contexto: ContextoSolicitud): Promise<Result<ComparacionRotacionesDto, DomainError>> {
    const area = AreaSeleccionada.desdeDto(input.area);
    if (!area.ok) return area;
    return await this.motor.comparar(
      {
        area: area.value,
        sitio: { tipo: "ubicacion", nombre: null },
        altitudM: input.altitudM ?? null,
        fuenteAltitud: input.altitudM === undefined ? null : "usuario",
        tieneRiego: input.tieneRiego,
        cultivoActual: input.cultivoActual ?? null,
        secuenciaActual: input.secuenciaActual,
        prioridades: input.prioridades,
      },
      contexto,
    );
  }
}
