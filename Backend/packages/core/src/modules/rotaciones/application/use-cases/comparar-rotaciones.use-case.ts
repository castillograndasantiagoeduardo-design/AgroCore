/**
 * Caso de uso: comparar 3 estrategias de rotación de 2 años para una finca.
 *   A = la actual · B = la mejor para el suelo · C = la mejor para lechería / forraje.
 *
 * Solo lectura: no muta estado, así que no audita (Regla 6).
 * El motor vive en los servicios de dominio de rotaciones (puros y deterministas).
 */
import type {
  ComparacionRotacionesDto,
  CompararRotacionesInput,
  EstrategiaRotacionDto,
  IdEstrategia,
} from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import { FincaNoEncontradoError } from "../../../fincas/domain/errors/finca.errors.ts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import {
  RotacionCultivoActualRequeridoError,
  RotacionCultivoDesconocidoError,
  RotacionSinAlternativasError,
} from "../../domain/errors/rotacion.errors.ts";
import type { ContextoMotor } from "../../domain/services/evaluar-paso.service.ts";
import {
  buscarMejorSecuencia,
  esViableEnAlgunSemestre,
  evaluarSecuencia,
  SEMESTRES_ROTACION,
  type SecuenciaEvaluada,
} from "../../domain/services/generar-estrategias.service.ts";
import { explicarEstrategia, NOMBRES_ESTRATEGIA } from "../../domain/services/explicar-estrategia.service.ts";
import { calcularVentanasSiembra } from "../../domain/services/ventanas-siembra.service.ts";
import type { ContextoSolicitud, ICultivoRepository, IFincaRepository, IPerfilClimaticoQuery } from "../ports/index.ts";

export const AVISO_ROTACIONES =
  "Esta comparación sugiere y explica con los datos disponibles; no reemplaza el criterio del agricultor ni la recomendación de un agrónomo.";

export class CompararRotacionesUseCase {
  constructor(
    private readonly fincas: IFincaRepository,
    private readonly cultivos: ICultivoRepository,
    private readonly perfilClimatico: IPerfilClimaticoQuery,
  ) {}

  async execute(
    input: CompararRotacionesInput,
    contexto: ContextoSolicitud,
  ): Promise<Result<ComparacionRotacionesDto, DomainError>> {
    // 1. Finca
    const finca = await this.fincas.buscarPorId(input.fincaId);
    if (!finca) return Result.err(new FincaNoEncontradoError(input.fincaId));

    // 2. Catálogo
    const catalogo = await this.cultivos.listar();
    const porClave = new Map<string, Cultivo>(catalogo.map((c) => [c.clave, c]));

    // 3. Secuencia actual (estrategia A)
    const secuenciaAsumida = !input.secuenciaActual;
    const clavesActuales = input.secuenciaActual ?? (finca.cultivoActual ? [finca.cultivoActual] : []);
    if (clavesActuales.length === 0) return Result.err(new RotacionCultivoActualRequeridoError(input.fincaId));
    const actuales: Cultivo[] = [];
    for (const clave of clavesActuales) {
      const c = porClave.get(clave);
      if (!c) return Result.err(new RotacionCultivoDesconocidoError(clave));
      actuales.push(c);
    }
    const secuenciaA = Array.from({ length: SEMESTRES_ROTACION }, (_, i) => actuales[i % actuales.length]);
    const clavePrincipal = clavesActuales[0];
    const principal = actuales[0];

    // 4. Perfil climático
    const perfilR = await this.perfilClimatico.execute({ fincaId: input.fincaId }, contexto);
    if (!perfilR.ok) return Result.err(perfilR.error);
    const perfil = perfilR.value;

    // 5. Altitud de referencia
    const advertencias: string[] = [];
    const altitudConocida = finca.ubicacion.altitudM !== null;
    const altitudM = finca.ubicacion.altitudM ?? perfil.altitudReferenciaM;
    if (!altitudConocida) {
      advertencias.push(
        "La finca no tiene altitud registrada: se usó la del perfil climático (" + altitudM + " m). Registrarla mejora la comparación.",
      );
    }

    // 6. Ventanas de siembra
    const { ventanas, advertencias: advVentanas } = calcularVentanasSiembra(perfil.meses);
    advertencias.push(...advVentanas);
    const ctx: ContextoMotor = { perfil, ventanas, altitudM, tieneRiego: finca.tieneRiego };

    // 10. Estrategia A: la secuencia actual tal cual, sin corregirla
    const evalA = evaluarSecuencia(secuenciaA, ctx, input.prioridades);

    // 11. Estrategia B: mejor para el suelo (incluye el cultivo principal si es viable)
    let requerirClave: string | undefined = clavePrincipal;
    if (!esViableEnAlgunSemestre(principal, ctx)) {
      requerirClave = undefined;
      advertencias.push(
        "El cultivo principal de la finca (" + principal.nombre +
          ") no es viable en ningún semestre con las condiciones calculadas (altitud, helada, agua o ciclo): la estrategia B no lo exige.",
      );
    }
    const puntuarB = (s: SecuenciaEvaluada) => 0.5 * s.puntajes.suelo + 0.3 * s.puntajes.plagas + 0.2 * s.puntajeTotal;
    // B es una rotación de cultivos de ciclo corto: no usa praderas perennes (convertir el lote a
    // pradera es la estrategia C), salvo que la pradera sea precisamente el cultivo principal de la finca.
    const soloAnuales = !principal.perenne;
    let evalB = buscarMejorSecuencia(catalogo, ctx, input.prioridades, { puntuar: puntuarB, requerirClave, soloAnuales });
    if (!evalB && requerirClave) {
      advertencias.push(
        "Ninguna rotación válida incluye " + principal.nombre + " con las reglas duras: la estrategia B se calculó sin exigir ese cultivo.",
      );
      evalB = buscarMejorSecuencia(catalogo, ctx, input.prioridades, { puntuar: puntuarB, soloAnuales });
    }
    if (!evalB && soloAnuales) {
      advertencias.push(
        "No hay una rotación de cultivos de ciclo corto que cumpla las reglas en esta finca: la estrategia B incluye pradera perenne.",
      );
      evalB = buscarMejorSecuencia(catalogo, ctx, input.prioridades, { puntuar: puntuarB });
    }
    if (!evalB) {
      return Result.err(
        new RotacionSinAlternativasError("ninguna secuencia cumple a la vez altitud, helada, agua, ciclo, familia y leguminosa"),
      );
    }

    // Estrategia C: mejor para forraje, distinta de B
    const claveB = evalB.claves.join(",");
    const evalC = buscarMejorSecuencia(catalogo, ctx, input.prioridades, {
      puntuar: (s) => 0.6 * s.puntajes.forraje + 0.2 * s.puntajes.plagas + 0.2 * s.puntajeTotal,
      excluirSecuencias: [claveB],
    });
    if (!evalC) {
      return Result.err(new RotacionSinAlternativasError("no hay una segunda secuencia válida distinta de la estrategia B"));
    }

    // 12. Textos y 13. salida
    const construir = (id: IdEstrategia, enfoque: EstrategiaRotacionDto["enfoque"], s: SecuenciaEvaluada): EstrategiaRotacionDto => {
      const asumida = id === "A" && secuenciaAsumida;
      const t = explicarEstrategia({ id, secuencia: s, ctx, altitudConocida, clavePrincipal, secuenciaAsumida: asumida });
      const vacios = asumida
        ? [
          "Se ASUMIÓ que la finca repite su cultivo actual (" + principal.nombre +
          ") en los 4 semestres porque no se conoce su historial de siembras.",
          ...t.vaciosInformacion,
        ]
        : t.vaciosInformacion;
      return {
        id,
        enfoque,
        nombre: NOMBRES_ESTRATEGIA[id],
        secuencia: s.pasos,
        porQue: t.porQue,
        evidencia: t.evidencia,
        beneficios: t.beneficios,
        vaciosInformacion: vacios,
        riesgos: t.riesgos,
        reglas: s.reglas,
        puntajes: s.puntajes,
        puntajeTotal: s.puntajeTotal,
      };
    };
    const estrategias = [construir("A", "actual", evalA), construir("B", "suelo", evalB), construir("C", "forraje", evalC)];

    // Mejor puntuada: en empate gana B, luego C, luego A
    const orden: IdEstrategia[] = ["B", "C", "A"];
    let mejor: IdEstrategia = "B";
    let mejorTotal = estrategias[1].puntajeTotal;
    for (const id of orden) {
      const e = estrategias.find((x) => x.id === id)!;
      if (e.puntajeTotal > mejorTotal) {
        mejor = id;
        mejorTotal = e.puntajeTotal;
      }
    }

    return Result.ok({
      finca: {
        id: input.fincaId,
        nombre: finca.nombre,
        altitudReferenciaM: altitudM,
        altitudConocida,
        zonaAltitudinal: finca.ubicacion.zona,
        tieneRiego: finca.tieneRiego,
        cultivoActual: finca.cultivoActual,
      },
      prioridades: input.prioridades,
      clima: {
        fuente: perfil.fuente,
        calibrado: perfil.calibracion !== null,
        lluviaAnualMm: perfil.resumen.lluviaAnualMm,
        mesesLluviosos: perfil.resumen.mesesLluviosos,
        mesesRiesgoHelada: perfil.resumen.mesesRiesgoHelada,
      },
      ventanasSiembra: ventanas,
      estrategias,
      estrategiaMejorPuntuada: mejor,
      advertencias: [...advertencias, ...perfil.advertencias],
      aviso: AVISO_ROTACIONES,
    });
  }
}
