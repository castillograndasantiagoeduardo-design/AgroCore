/**
 * Caso de uso RecomendarPorEpoca — ETAPA RÁPIDA de la recomendación (fases 2 y 3 de la v2).
 *
 *  1. Valida el área (punto o polígono ≤ 100 ha).
 *  2. EN PARALELO: vías / edificaciones / agua (OSM o precálculo), cobertura MODIS, elevación del centro (SRTM),
 *     perfil climático rápido (serie diaria si está en caché o precálculo; si no, climatología mensual de NASA) y
 *     presencia local de cultivos (EVA / FAOSTAT).
 *  3. Aptitud del terreno con las reglas puras del módulo terreno. No apto → sin épocas ni cultivos.
 *  4. Épocas del año derivadas del clima y qué sembrar en cada una para los 4 objetivos (cambiar de objetivo en la
 *     interfaz no hace otra petición).
 *
 * Nunca se queda trabado: todo proveedor tiene su timeout y la petición entera un plazo (PLAZO_MAXIMO_PETICION_MS);
 * lo que no llega a tiempo queda como "Sin datos de …" con advertencia. Solo lectura: no audita (Regla 6).
 */
import {
  type AptitudRapidaDto,
  type CoberturaDto,
  type DatoConFuente,
  NOMBRE_PASO_CARGA,
  type PasoCargaDto,
  type PasoCargaId,
  PLAZO_MAXIMO_PETICION_MS,
  type RecomendacionInput,
  type RecomendacionRapidaDto,
} from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";
import { conPlazo, type ITemporizador } from "../../../../shared/application/ports/temporizador.port.ts";
import { type IMedidorTiempos, MEDIDOR_NULO } from "../../../../shared/application/ports/medidor-tiempos.port.ts";
import { CLASES_IGBP, decidirAptitud, evaluarAfectacion } from "../../../terreno/domain/services/aptitud-terreno.service.ts";
import { MARGEN_BUSQUEDA_VIAS_M } from "../../../terreno/application/use-cases/analizar-terreno.use-case.ts";
import type { ICoberturaProvider, IElevacionProvider, IReloj, IViasProvider } from "../../../terreno/application/ports/index.ts";
import type { PerfilClimaticoDto } from "@agrocore/contracts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import { RotacionCultivoDesconocidoError } from "../../../rotaciones/domain/errors/rotacion.errors.ts";
import { derivarEpocas } from "../../domain/services/epocas.service.ts";
import { recomendarPorEpoca } from "../../domain/services/recomendar-epoca.service.ts";
import { crearPresenciaMotor, presenciaDto } from "../presencia.ts";
import type { ContextoSolicitud, ICultivoRepository, IPresenciaLocalProvider, PresenciaLocal } from "../ports/index.ts";
import { RecomendacionSinClimaError } from "../../domain/errors/recomendacion.errors.ts";

/** Versión del motor de recomendación: si cambia, el precálculo se recalcula. */
export const VERSION_MOTOR = "v2.0.0";

export const AVISO_RECOMENDACION =
  "AgroCore sugiere y explica con datos públicos; no reemplaza el criterio del agricultor ni la recomendación de un agrónomo local.";

/** Tiempo que la etapa rápida espera la serie diaria antes de usar la climatología mensual. */
export const ESPERA_SERIE_DIARIA_MS = 3_000;
/** Tiempo máximo para la elevación del centro en la etapa rápida (si no llega, se usa la altitud de la celda). */
export const ESPERA_ELEVACION_MS = 2_500;

/** Puerto mínimo del clima que necesita la recomendación (lo implementa ObtenerPerfilClimaticoUseCase). */
export interface IPerfilClimaticoRapidoQuery {
  porUbicacionRapida(
    ubicacion: { latitud: number; longitud: number; altitudM: number | null },
    contexto: ContextoSolicitud,
    plazoMs: number,
  ): Promise<Result<{ perfil: PerfilClimaticoDto; origen: "serie_diaria" | "climatologia" }, DomainError>>;
}

/** Recibe el avance de cada paso (pantalla de carga con progreso real). */
export interface IReportadorProgreso {
  paso(paso: PasoCargaDto): void;
  dato(etiqueta: string, dato: DatoConFuente<number>): void;
}

export const REPORTADOR_NULO: IReportadorProgreso = { paso: () => {}, dato: () => {} };

export interface DependenciasRecomendacion {
  vias: IViasProvider;
  cobertura: ICoberturaProvider;
  elevacion: IElevacionProvider;
  clima: IPerfilClimaticoRapidoQuery;
  presencia: IPresenciaLocalProvider;
  cultivos: ICultivoRepository;
  temporizador: ITemporizador;
  reloj: IReloj;
  medidor?: IMedidorTiempos;
  /** true si el punto está en la región precalculada (lo decide el adaptador; sirve para rotular el origen). */
  enRegionPrecalculada?: (latitud: number, longitud: number) => boolean;
}

export function paso(id: PasoCargaId, estado: PasoCargaDto["estado"], detalle?: string): PasoCargaDto {
  return { id, nombre: NOMBRE_PASO_CARGA[id], estado, ...(detalle ? { detalle } : {}) };
}

export class RecomendarPorEpocaUseCase {
  constructor(private readonly d: DependenciasRecomendacion) {}

  async execute(
    input: RecomendacionInput,
    _contexto: ContextoSolicitud,
    progreso: IReportadorProgreso = REPORTADOR_NULO,
  ): Promise<Result<RecomendacionRapidaDto, DomainError>> {
    const areaR = AreaSeleccionada.desdeDto(input.area);
    if (!areaR.ok) return areaR;
    const area = areaR.value;
    const catalogo = await this.d.cultivos.listar();
    let actual: Cultivo | null = null;
    if (input.cultivoActual) {
      actual = catalogo.find((c) => c.clave === input.cultivoActual) ?? null;
      if (!actual) return Result.err(new RotacionCultivoDesconocidoError(input.cultivoActual));
    }

    const m = this.d.medidor ?? MEDIDOR_NULO;
    const plazo = this.d.temporizador.esperar(PLAZO_MAXIMO_PETICION_MS);
    const [lat, lon] = area.centro;
    const pasos = new Map<PasoCargaId, PasoCargaDto>();
    const marcar = (p: PasoCargaDto) => {
      pasos.set(p.id, p);
      progreso.paso(p);
    };
    marcar(paso("vias", "pendiente"));
    marcar(paso("clima", "pendiente"));
    marcar(paso("recomendacion", "pendiente"));

    // 2. Proveedores en paralelo, cada uno con el plazo de la petición.
    const pVias = conPlazo(m.medir("overpass", () => this.d.vias.obtenerElementos(area.caja(MARGEN_BUSQUEDA_VIAS_M))), plazo);
    const pCobertura = conPlazo(m.medir("modis_cobertura", () => this.d.cobertura.obtenerCobertura(lat, lon)), plazo);
    const pPresencia = conPlazo(this.d.presencia.obtenerPresencia(lat, lon), plazo);
    const pElevacion = conPlazo(
      m.medir("srtm", () => this.d.elevacion.obtenerElevaciones([area.centro])),
      Promise.race([plazo, this.d.temporizador.esperar(ESPERA_ELEVACION_MS)]),
    );

    // 3. Aptitud (vías + cobertura)
    const [viasR, coberturaR] = await Promise.all([pVias, pCobertura]);
    const advertencias: string[] = [];
    const vacios: string[] = [];
    let afectacion = null;
    let viasCercanas: AptitudRapidaDto["viasCercanas"] = [];
    if (!viasR.vencido && viasR.valor.ok) {
      const r = evaluarAfectacion(area, viasR.valor.value);
      afectacion = r.afectacion;
      viasCercanas = r.viasCercanas.map((v) => ({
        tipo: v.tipo,
        nombre: v.nombre,
        distanciaM: { valor: v.distanciaM, unidad: "m", fuente: "OSM", tipo: "calculado", nota: "Distancia al eje de la vía" },
        semiAnchoM: { valor: v.semiAnchoM, unidad: "m", fuente: "CALCULO", tipo: "referencia", nota: "Medio ancho típico de ese tipo de vía (criterio del sistema)" },
        geometria: v.geometria.map(([la, lo]) => [la, lo] as [number, number]),
      }));
      marcar(paso("vias", "listo"));
    } else {
      const motivo = viasR.vencido ? "no respondió a tiempo" : viasR.valor.ok ? "" : viasR.valor.error.message;
      advertencias.push("OpenStreetMap: " + motivo + ". No se verificó si el sitio cruza vías, edificaciones o agua.");
      vacios.push("Sin datos de OpenStreetMap: no se verificaron vías, edificaciones ni agua.");
      marcar(paso("vias", "no_disponible", "OpenStreetMap no respondió"));
    }
    let cobertura: CoberturaDto | null = null;
    if (!coberturaR.vencido && coberturaR.valor.ok && coberturaR.valor.value) {
      const clase = CLASES_IGBP[coberturaR.valor.value.claseIgbp];
      if (clase) {
        cobertura = { claseIgbp: coberturaR.valor.value.claseIgbp, nombre: clase.nombre, categoria: clase.categoria, anio: coberturaR.valor.value.anio, fuente: coberturaR.valor.value.fuente };
      }
    } else {
      vacios.push("Sin datos de uso del suelo (MODIS): no se verificó si es urbano, bosque o agua.");
    }
    const decision = decidirAptitud(area.tipo, afectacion, cobertura?.categoria ?? null, cobertura?.nombre ?? null);
    advertencias.push(...decision.advertencias);
    const fuentesAptitud: AptitudRapidaDto["fuentes"] = [];
    if (afectacion) fuentesAptitud.push("OSM");
    if (cobertura) fuentesAptitud.push("MODIS_COBERTURA");
    const aptitud: AptitudRapidaDto = {
      estado: decision.aptitud,
      mensaje: decision.mensaje,
      viasVerificadas: afectacion !== null,
      viasCercanas,
      fuentes: fuentesAptitud,
    };

    // 4. Altitud y clima
    const elevR = await pElevacion;
    const elevacion = !elevR.vencido && elevR.valor.ok ? elevR.valor.value.elevacionesM[0] ?? null : null;
    if (elevacion !== null) progreso.dato("Altitud del lugar", { valor: Math.round(elevacion), unidad: "m", fuente: "SRTM", tipo: "medido" });
    const climaR = await conPlazo(
      this.d.clima.porUbicacionRapida({ latitud: lat, longitud: lon, altitudM: elevacion }, _contexto, ESPERA_SERIE_DIARIA_MS),
      plazo,
    );
    const presenciaR = await pPresencia;

    const base = {
      ubicacion: area.resumen(),
      aptitud,
      versionMotor: VERSION_MOTOR,
      generadoEn: this.d.reloj.hoy().toISOString(),
      aviso: AVISO_RECOMENDACION,
    };
    const vacioRapido = (motivo: string): RecomendacionRapidaDto => ({
      ...base,
      resumenClima: {
        lluviaAnualMm: { valor: null, unidad: "mm", fuente: "NASA_POWER", tipo: "medido", nota: "Sin datos de NASA POWER" },
        tempMediaC: { valor: null, unidad: "°C", fuente: "NASA_POWER", tipo: "medido", nota: "Sin datos de NASA POWER" },
        altitudM: elevacion === null
          ? { valor: null, unidad: "m", fuente: "SRTM", tipo: "medido", nota: "Sin datos de elevación SRTM" }
          : { valor: Math.round(elevacion), unidad: "m", fuente: "SRTM", tipo: "medido" },
        origen: "serie_diaria",
      },
      epocas: [],
      recomendaciones: { equilibrado: [], mejorar_suelo: [], ahorrar_agua: [], mas_ingreso: [] },
      presenciaLocal: null,
      pasos: [...pasos.values()],
      origen: "en_vivo",
      advertencias: [...new Set([...advertencias, motivo])],
      vaciosInformacion: [...new Set(vacios)],
    });

    if (climaR.vencido || !climaR.valor.ok) {
      marcar(paso("clima", "no_disponible", "NASA POWER no respondió"));
      marcar(paso("recomendacion", "no_disponible"));
      const motivo = climaR.vencido ? "NASA POWER no respondió a tiempo" : (climaR.valor as { ok: false; error: DomainError }).error.message;
      if (aptitud.estado !== "apto") return Result.ok(vacioRapido(motivo));
      return Result.err(new RecomendacionSinClimaError(motivo));
    }
    const { perfil, origen: origenClima } = climaR.valor.value;
    marcar(paso("clima", "listo", origenClima === "climatologia" ? "Promedios mensuales (aproximado)" : undefined));
    const fechaClima = perfil.periodo.desde.slice(0, 4) + "-" + perfil.periodo.hasta.slice(0, 4);
    const lluvia: DatoConFuente<number> = {
      valor: perfil.resumen.lluviaAnualMm,
      unidad: "mm",
      fuente: "NASA_POWER",
      tipo: origenClima === "climatologia" ? "estimado" : "medido",
      fecha: fechaClima,
      ...(perfil.calibracion ? { nota: "Calibrado con la estación IDEAM " + perfil.calibracion.estacion } : {}),
    };
    progreso.dato("Lluvia del año", lluvia);
    const resumenClima: RecomendacionRapidaDto["resumenClima"] = {
      lluviaAnualMm: lluvia,
      tempMediaC: { valor: perfil.resumen.tempMediaAnualC, unidad: "°C", fuente: "NASA_POWER", tipo: lluvia.tipo, fecha: fechaClima },
      altitudM: elevacion !== null
        ? { valor: Math.round(elevacion), unidad: "m", fuente: "SRTM", tipo: "medido" }
        : { valor: perfil.altitudCeldaM, unidad: "m", fuente: "NASA_POWER", tipo: "estimado", nota: "Altitud promedio de la celda de NASA (aproximada)" },
      origen: origenClima,
    };
    advertencias.push(...perfil.advertencias);

    if (aptitud.estado !== "apto") {
      marcar(paso("recomendacion", "listo", "Sitio no apto: no se recomiendan cultivos"));
      return Result.ok({ ...vacioRapido(aptitud.mensaje), resumenClima, advertencias: [...new Set(advertencias)] });
    }

    // 5. Presencia local y recomendación por época
    let presencia: PresenciaLocal | null = null;
    if (presenciaR.vencido) {
      vacios.push("Sin datos de presencia local de cultivos: la fuente no respondió a tiempo.");
    } else if (!presenciaR.valor.ok) {
      vacios.push("Sin datos de presencia local de cultivos: " + presenciaR.valor.error.message);
    } else {
      presencia = presenciaR.valor.value;
      if (!presencia) vacios.push("Sin datos de presencia local de cultivos para este lugar.");
    }
    const motorPresencia = crearPresenciaMotor(presencia, catalogo);
    const epocas = derivarEpocas(perfil, origenClima);
    const recomendaciones = m.medirSync("motor", () =>
      recomendarPorEpoca({ perfil, epocas, catalogo, tieneRiego: input.tieneRiego, cultivoActual: actual, presencia: motorPresencia })
    );
    marcar(paso("recomendacion", "listo"));

    return Result.ok({
      ...base,
      resumenClima,
      epocas,
      recomendaciones,
      presenciaLocal: presenciaDto(presencia, motorPresencia, catalogo, presencia !== null),
      pasos: [...pasos.values()],
      origen: this.d.enRegionPrecalculada?.(lat, lon) ? "precalculo" : "en_vivo",
      advertencias: [...new Set(advertencias)],
      vaciosInformacion: [...new Set(vacios)],
    });
  }
}
