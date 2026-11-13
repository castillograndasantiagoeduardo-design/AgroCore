/**
 * Caso de uso: perfil climático de una finca.
 *
 * 1. Busca la finca (necesitamos sus coordenadas y altitud).
 * 2. Define el periodo: los últimos 30 años completos (normal climatológica).
 * 3. Pide la serie diaria de la finca al proveedor satelital (puerto IClimaProvider).
 * 4. Calibra esa serie con la estación IDEAM más cercana (puerto INormalesClimatologicasProvider).
 *    Si no hay estación cercana o el IDEAM no responde, sigue SIN calibrar y lo advierte.
 * 5. Corrige la temperatura por la altitud de la finca.
 * 6. Calcula el calendario de 12 meses y un resumen.
 *
 * Solo lectura: no muta estado, así que no audita (Regla 6).
 */
import type { CalibracionDto, PerfilClimaticoDto, PerfilClimaticoParams } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import type { IFincaRepository } from "../../../fincas/domain/repositories/finca.repository.ts";
import { FincaNoEncontradoError } from "../../../fincas/domain/errors/finca.errors.ts";
import type { RegistroClimaDiario } from "../../domain/value-objects/registro-clima-diario.vo.ts";
import { calcularAjusteTemperatura, DIFERENCIA_ALTITUD_GRANDE_M } from "../../domain/services/correccion-altitud.service.ts";
import {
  calcularCalendarioMensual,
  PROBABILIDAD_RIESGO_HELADA,
  UMBRAL_HELADA_C,
  UMBRAL_LLUVIA_FUERTE_MM,
} from "../../domain/services/calendario-climatico.service.ts";
import {
  aplicarCalibracion,
  calcularFactoresCalibracion,
  DISTANCIA_MAX_CALIBRACION_KM,
} from "../../domain/services/calibracion.service.ts";
import { ClimaSinDatosError } from "../../domain/errors/clima.errors.ts";
import type { ContextoSolicitud, IClimaProvider, INormalesClimatologicasProvider, IReloj } from "../ports/index.ts";

export const ANIOS_NORMAL_CLIMATOLOGICA = 30;

const redondear1 = (v: number) => Math.round(v * 10) / 10;

export class ObtenerPerfilClimaticoUseCase {
  constructor(
    private readonly fincas: IFincaRepository,
    private readonly clima: IClimaProvider,
    private readonly normales: INormalesClimatologicasProvider,
    private readonly reloj: IReloj,
  ) {}

  async execute(input: PerfilClimaticoParams, _contexto: ContextoSolicitud): Promise<Result<PerfilClimaticoDto, DomainError>> {
    // 1. Finca
    const finca = await this.fincas.buscarPorId(input.fincaId);
    if (!finca) return Result.err(new FincaNoEncontradoError(input.fincaId));
    const { latitud, longitud, altitudM } = finca.ubicacion;

    // 2. Periodo: 30 años completos que terminan el año pasado
    const anioFin = this.reloj.hoy().getUTCFullYear() - 1;
    const anioInicio = anioFin - ANIOS_NORMAL_CLIMATOLOGICA + 1;
    const desde = anioInicio + "-01-01";
    const hasta = anioFin + "-12-31";

    // 3. Datos satelitales de la finca
    const consulta = await this.clima.obtenerSerieDiaria({ latitud, longitud, desde, hasta });
    if (!consulta.ok) return consulta;
    const serie = consulta.value;
    const advertencias: string[] = [];

    // 4. Calibración con IDEAM
    const { registros, calibracion } = await this.calibrar(latitud, longitud, serie.registros, advertencias);

    // 5. Corrección por altitud
    const altitudReferenciaM = altitudM ?? serie.altitudCeldaM;
    const ajuste = calcularAjusteTemperatura(serie.altitudCeldaM, altitudReferenciaM);
    if (altitudM === null) {
      advertencias.push(
        "La finca no tiene altitud registrada: se usó la altitud de la celda de " + serie.fuente + " (" +
          Math.round(serie.altitudCeldaM) + " m) sin corrección. Registra la altitud para un cálculo más preciso.",
      );
    } else if (Math.abs(serie.altitudCeldaM - altitudM) > DIFERENCIA_ALTITUD_GRANDE_M) {
      advertencias.push(
        "La finca está a " + Math.abs(Math.round(serie.altitudCeldaM - altitudM)) +
          " m de diferencia con la celda de " + serie.fuente + ": la corrección por altitud es aproximada.",
      );
    }
    advertencias.push(
      calibracion
        ? "La calibración corrige los PROMEDIOS de cada mes, pero " + serie.fuente + " varía menos de un día a otro que la " +
          "realidad: las heladas de noches puntuales (sobre todo en hondonadas) pueden seguir subestimadas. " +
          "Contrasta con la experiencia del agricultor."
        : serie.fuente + " promedia un área de decenas de km: en hondonadas y sitios con aire frío estancado las heladas " +
          "pueden ser más frecuentes y la lluvia puede estar sobreestimada. Conviene validar con una estación IDEAM.",
    );

    // 6. Calendario y resumen
    const meses = calcularCalendarioMensual(registros, ajuste);
    if (meses.length !== 12) return Result.err(new ClimaSinDatosError(latitud, longitud));

    const lluviaAnualMm = redondear1(meses.reduce((s, m) => s + m.lluviaMm, 0));
    const tempMediaAnualC = redondear1(meses.reduce((s, m) => s + m.tempMediaC, 0) / 12);

    return Result.ok({
      fincaId: input.fincaId,
      latitud,
      longitud,
      altitudReferenciaM: Math.round(altitudReferenciaM),
      altitudCeldaM: Math.round(serie.altitudCeldaM),
      ajusteTemperaturaC: Math.round(ajuste * 100) / 100,
      periodo: { desde, hasta, anios: ANIOS_NORMAL_CLIMATOLOGICA },
      fuente: calibracion ? serie.fuente + " calibrado con IDEAM" : serie.fuente,
      calibracion,
      umbrales: { heladaC: UMBRAL_HELADA_C, lluviaFuerteMm: UMBRAL_LLUVIA_FUERTE_MM },
      meses,
      resumen: {
        lluviaAnualMm,
        tempMediaAnualC,
        mesesLluviosos: meses.filter((m) => m.temporada === "lluviosa").map((m) => m.mes),
        mesesSecos: meses.filter((m) => m.temporada === "seca").map((m) => m.mes),
        mesesRiesgoHelada: meses.filter((m) => m.probabilidadHelada >= PROBABILIDAD_RIESGO_HELADA).map((m) => m.mes),
      },
      advertencias,
    });
  }

  /**
   * Intenta calibrar la serie de la finca. Nunca falla: si algo no está disponible devuelve la serie
   * original, calibracion = null y deja una advertencia explicando por qué.
   */
  private async calibrar(
    latitud: number,
    longitud: number,
    registros: RegistroClimaDiario[],
    advertencias: string[],
  ): Promise<{ registros: RegistroClimaDiario[]; calibracion: CalibracionDto | null }> {
    const sinCalibrar = { registros, calibracion: null };

    const busqueda = await this.normales.estacionMasCercana(latitud, longitud);
    if (!busqueda.ok) {
      advertencias.push("No se pudo consultar el IDEAM (" + busqueda.error.message + "): datos SIN calibrar.");
      return sinCalibrar;
    }
    if (!busqueda.value || busqueda.value.distanciaKm > DISTANCIA_MAX_CALIBRACION_KM) {
      advertencias.push(
        "No hay estación IDEAM con normales completas a menos de " + DISTANCIA_MAX_CALIBRACION_KM + " km: datos SIN calibrar.",
      );
      return sinCalibrar;
    }

    const { normal, distanciaKm } = busqueda.value;
    const nasaEstacion = await this.clima.obtenerSerieDiaria({
      latitud: normal.latitud,
      longitud: normal.longitud,
      desde: normal.anioInicio + "-01-01",
      hasta: normal.anioFin + "-12-31",
    });
    if (!nasaEstacion.ok) {
      advertencias.push("No se pudo obtener la serie satelital de la estación " + normal.estacion + ": datos SIN calibrar.");
      return sinCalibrar;
    }

    const ajusteEstacion = calcularAjusteTemperatura(nasaEstacion.value.altitudCeldaM, normal.altitudM);
    const factores = calcularFactoresCalibracion(normal, nasaEstacion.value.registros, ajusteEstacion);
    if (!factores) {
      advertencias.push("La serie satelital de la estación " + normal.estacion + " está incompleta: datos SIN calibrar.");
      return sinCalibrar;
    }

    return {
      registros: aplicarCalibracion(registros, factores),
      calibracion: {
        fuente: normal.fuente,
        estacion: normal.estacion,
        codigoEstacion: normal.codigoEstacion,
        municipioEstacion: normal.municipio,
        altitudEstacionM: normal.altitudM,
        distanciaKm: Math.round(distanciaKm * 10) / 10,
        periodo: normal.anioInicio + "-" + normal.anioFin,
        factores,
      },
    };
  }
}
