/**
 * Caso de uso: crear finca. Persiste vía puerto, audita con IAuditor y retorna Result.
 *
 * Regla: `cultivoActual`, si se envía, debe ser una clave del catálogo de cultivos
 * (el motor de rotaciones la necesita para aplicar "no repetir familia").
 */
import { AUDIT_ACTIONS, type CrearFincaInput } from "@duitamacrece/contracts";
import { DomainError, Result } from "@duitamacrece/shared-kernel";
import type { ICultivoRepository } from "../../../cultivos/domain/repositories/cultivo.repository.ts";
import { Finca, type FincaSnapshot } from "../../domain/entities/finca.entity.ts";
import { FincaCultivoDesconocidoError } from "../../domain/errors/finca.errors.ts";
import type { IFincaRepository } from "../../domain/repositories/finca.repository.ts";
import { verificarNombreFincaDisponible } from "../../domain/services/finca.service.ts";
import type { ContextoSolicitud, IAuditor, IUnitOfWork } from "../ports/index.ts";

export class CrearFincaUseCase {
  constructor(
    private readonly repositorio: IFincaRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly auditor: IAuditor,
    private readonly cultivos: ICultivoRepository,
  ) {}

  async execute(input: CrearFincaInput, contexto: ContextoSolicitud): Promise<Result<FincaSnapshot, DomainError>> {
    const creado = Finca.crear(input);
    if (!creado.ok) return creado;

    const clave = creado.value.cultivoActual;
    if (clave !== null && (await this.cultivos.buscarPorClave(clave)) === null) {
      return Result.err(new FincaCultivoDesconocidoError(clave));
    }

    return await this.unitOfWork.ejecutar(async (): Promise<Result<FincaSnapshot, DomainError>> => {
      const disponible = verificarNombreFincaDisponible(await this.repositorio.buscarPorNombre(creado.value.nombre));
      if (!disponible.ok) return disponible;

      const guardado = await this.repositorio.guardar(creado.value);
      const despues = guardado.toSnapshot();

      await this.auditor.registrar({
        accion: AUDIT_ACTIONS.FINCA_CREADO,
        entidad: "fincas",
        entidadId: despues.id ?? 0,
        detalles: { antes: null, despues: { ...despues } },
        contexto,
      });

      return Result.ok(despues);
    });
  }
}
