/**
 * Caso de uso RecomendacionDetalle — ETAPA DE DETALLE (se pide en paralelo con la rápida y se pinta después).
 *
 *  1. Terreno completo (OSM, MODIS cobertura y NDVI, SoilGrids, SRTM, humedad) y perfil climático con la serie diaria
 *     de 30 años, en paralelo, más la presencia local de cultivos.
 *  2. Motor de rotaciones: 3 o más estrategias de 2 años (incluida la actual si se indicó el cultivo actual) con por qué,
 *     evidencia, beneficios, vacíos de información y riesgos.
 *  3. Toda cifra de la respuesta se arma como DatoConFuente (fuente, tipo y fecha).
 *
 * Plazo total PLAZO_MAXIMO_PETICION_MS: lo que no llega a tiempo queda vacío con advertencia. Solo lectura.
 */
import {
  type DatoConFuente,
  type EstrategiaDetalleDto,
  type FuenteDato,
  type FuenteEvidencia,
  PESOS_OBJETIVO,
  type PasoCargaDto,
  type PasoCargaId,
  type PerfilClimaticoDto,
  type PerfilTerrenoDto,
  PLAZO_MAXIMO_PETICION_MS,
  type RecomendacionDetalleDto,
  type RecomendacionInput,
} from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";
import { conPlazo, type ITemporizador } from "../../../../shared/application/ports/temporizador.port.ts";
import type { IReloj } from "../../../terreno/application/ports/index.ts";
import type { MotorRotaciones } from "../../../rotaciones/application/use-cases/motor-rotaciones.ts";
import type { PresenciaMotor } from "../../../rotaciones/domain/services/presencia-motor.ts";
import { crearPresenciaMotor } from "../presencia.ts";
import type { ContextoSolicitud, ICultivoRepository, IPresenciaLocalProvider, PresenciaLocal } from "../ports/index.ts";
import { AVISO_RECOMENDACION, type IReportadorProgreso, paso, REPORTADOR_NULO } from "./recomendar-por-epoca.use-case.ts";

export interface IPerfilClimaticoDiarioQuery {
  porUbicacion(
    ubicacion: { latitud: number; longitud: number; altitudM: number | null },
    contexto: ContextoSolicitud,
  ): Promise<Result<PerfilClimaticoDto, DomainError>>;
}

export interface ITerrenoCompletoQuery {
  analizar(area: AreaSeleccionada): Promise<PerfilTerrenoDto>;
}

export interface DependenciasDetalle {
  terreno: ITerrenoCompletoQuery;
  clima: IPerfilClimaticoDiarioQuery;
  presencia: IPresenciaLocalProvider;
  cultivos: ICultivoRepository;
  motor: MotorRotaciones;
  temporizador: ITemporizador;
  reloj: IReloj;
}

const FUENTE_EVIDENCIA: Record<FuenteEvidencia, FuenteDato> = {
  "NASA POWER": "NASA_POWER",
  IDEAM: "IDEAM",
  MODIS: "MODIS_NDVI",
  SoilGrids: "SOILGRIDS",
  SRTM: "SRTM",
  OpenStreetMap: "OSM",
  ECOCROP: "FAO_ECOCROP",
  Regla: "LITERATURA",
  Agricultor: "USUARIO",
};

const r1 = (v: number) => Math.round(v * 10) / 10;

function dato(valor: number | null, unidad: string, fuente: FuenteDato, tipo: DatoConFuente<number>["tipo"], fecha?: string, nota?: string): DatoConFuente<number> {
  return {
    valor: valor === null ? null : r1(valor),
    unidad,
    fuente,
    tipo,
    ...(fecha ? { fecha } : {}),
    ...(valor === null ? { nota: nota ?? "Sin datos" } : nota ? { nota } : {}),
  };
}

function terrenoDetalle(t: PerfilTerrenoDto | null): RecomendacionDetalleDto["terreno"] {
  const sinSuelo = "Sin datos de ISRIC SoilGrids";
  const s = t?.suelo ?? null;
  const ndvi = t?.ndvi ?? null;
  const fechaNdvi = ndvi ? ndvi.desde.slice(0, 4) + "-" + ndvi.hasta.slice(0, 4) : undefined;
  return {
    aptitud: t?.aptitud ?? "apto",
    mensajeAptitud: t?.mensajeAptitud ?? "Sin datos del terreno",
    elevacionM: dato(t?.elevacionM ?? null, "m", "SRTM", "medido", undefined, t?.elevacionM == null ? "Sin datos de elevación SRTM" : undefined),
    pendientePct: dato(t?.pendientePct ?? null, "%", "SRTM", "calculado", undefined, t?.pendientePct == null ? "Sin datos de pendiente (SRTM)" : "Calculada en el centro del lote"),
    excluidoPct: dato(t ? t.afectacion.excluidoPct : null, "%", "OSM", "calculado", undefined, t ? "Parte del área sobre vías, edificaciones o agua" : "Sin datos de OpenStreetMap"),
    suelo: {
      ph: dato(s?.ph ?? null, "pH", "SOILGRIDS", "medido", undefined, s ? "Modelo SoilGrids 250 m, " + s.profundidadCm : sinSuelo),
      arenaPct: dato(s?.arenaPct ?? null, "%", "SOILGRIDS", "medido", undefined, s ? undefined : sinSuelo),
      arcillaPct: dato(s?.arcillaPct ?? null, "%", "SOILGRIDS", "medido", undefined, s ? undefined : sinSuelo),
      carbonoOrganicoGKg: dato(s?.carbonoOrganicoGKg ?? null, "g/kg", "SOILGRIDS", "medido", undefined, s ? undefined : sinSuelo),
      textura: { valor: s?.textura ?? null, fuente: "SOILGRIDS", tipo: "calculado", nota: s ? "Clase según arena y arcilla" : sinSuelo },
    },
    cobertura: {
      valor: t?.cobertura?.nombre ?? null,
      fuente: "MODIS_COBERTURA",
      tipo: "medido",
      ...(t?.cobertura ? { fecha: String(t.cobertura.anio) } : { nota: "Sin datos de uso del suelo MODIS" }),
    },
    vegetacion: {
      ndviMensual: Array.from({ length: 12 }, (_, i) => {
        const c = ndvi?.climatologia.find((x) => x.mes === i + 1);
        return {
          mes: i + 1,
          ndvi: {
            valor: c?.ndviMedio ?? null,
            fuente: "MODIS_NDVI" as const,
            tipo: "medido" as const,
            ...(fechaNdvi ? { fecha: fechaNdvi } : {}),
            nota: c?.ndviMedio == null ? "Sin datos de NDVI MODIS" : "Índice de verdor (NDVI): 0 = suelo desnudo, 1 = vegetación densa",
          },
        };
      }),
      mesesBaldios: ndvi?.mesesBaldios ?? [],
      explicacion: ndvi ? ndvi.reglaBaldio : "Sin datos de NDVI MODIS: no se calcularon los meses baldíos.",
    },
    textura: s?.textura ?? null,
  };
}

function climaMensual(perfil: PerfilClimaticoDto | null): RecomendacionDetalleDto["climaMensual"] {
  if (!perfil) return [];
  const fecha = perfil.periodo.desde.slice(0, 4) + "-" + perfil.periodo.hasta.slice(0, 4);
  return perfil.meses.map((m) => ({
    mes: m.mes,
    lluviaMm: dato(m.lluviaMm, "mm", "NASA_POWER", "medido", fecha),
    etoMm: dato(m.etoMm, "mm", "CALCULO", "calculado", fecha, "ET0: agua que pierde un pasto de referencia (Hargreaves, FAO-56)"),
    tempMediaC: dato(m.tempMediaC, "°C", "NASA_POWER", "medido", fecha),
    tempMinC: dato(m.tempMinC, "°C", "NASA_POWER", "medido", fecha),
    tempMaxC: dato(m.tempMaxC, "°C", "NASA_POWER", "medido", fecha),
    diasHelada: dato(m.diasHeladaPromedio, "días", "NASA_POWER", "calculado", fecha),
    diasCalor: dato(m.diasCalorPromedio, "días", "NASA_POWER", "calculado", fecha),
  }));
}

function estrategiasDetalle(
  estrategias: { id: EstrategiaDetalleDto["id"]; nombre: string; secuencia: import("@agrocore/contracts").PasoRotacionDto[]; porQue: string; evidencia: { texto: string; fuente: FuenteEvidencia }[]; beneficios: string[]; vaciosInformacion: string[]; riesgos: string[]; puntajes: Record<"agua" | "suelo" | "plagas" | "forraje" | "ingreso", number | null>; puntajeTotal: number }[],
  presencia: PresenciaMotor,
  fecha: string,
): EstrategiaDetalleDto[] {
  const punt = (v: number | null, que: string) =>
    dato(v, "puntos de 100", "CALCULO", "calculado", undefined, v === null ? "Sin datos para el puntaje de " + que : "Puntaje de " + que + " (criterios documentados en el módulo rotaciones)");
  return estrategias.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    secuencia: e.secuencia.map((p) => ({
      orden: p.orden,
      anio: p.anio,
      cultivoClave: p.cultivoClave,
      cultivoNombre: p.cultivoNombre,
      continua: p.continua,
      mesSiembra: p.mesSiembra,
      mesCosecha: p.mesCosecha,
      mesesCiclo: p.mesesCiclo,
      presenciaLocal: p.cultivoClave === "barbecho" ? "sin_datos" : presencia.nivel(p.cultivoClave),
      tempMediaCicloC: dato(p.tempMediaCicloC, "°C", "NASA_POWER", "calculado", fecha, "Temperatura media de los meses del ciclo"),
      lluviaCicloMm: dato(p.lluviaCicloMm, "mm", "NASA_POWER", "calculado", fecha, "Lluvia de los meses del ciclo"),
      deficitAguaMm: dato(p.deficitAguaMm, "mm", "CALCULO", "calculado", fecha, "Agua que falta respecto a lo que pide el cultivo (FAO ECOCROP)"),
      riesgoHelada: p.riesgoHelada,
      riesgoCalor: p.riesgoCalor,
      notas: p.notas,
    })),
    porQue: e.porQue,
    evidencia: e.evidencia.map((x) => ({ texto: x.texto, fuente: FUENTE_EVIDENCIA[x.fuente] })),
    beneficios: e.beneficios,
    vaciosInformacion: e.vaciosInformacion,
    riesgos: e.riesgos,
    puntajes: {
      agua: punt(e.puntajes.agua, "agua"),
      suelo: punt(e.puntajes.suelo, "suelo"),
      plagas: punt(e.puntajes.plagas, "plagas"),
      forraje: punt(e.puntajes.forraje, "forraje"),
      ingreso: punt(e.puntajes.ingreso, "ingreso"),
    },
    puntajeTotal: punt(e.puntajeTotal, "total"),
  }));
}

export class RecomendacionDetalleUseCase {
  constructor(private readonly d: DependenciasDetalle) {}

  async execute(
    input: RecomendacionInput,
    contexto: ContextoSolicitud,
    progreso: IReportadorProgreso = REPORTADOR_NULO,
  ): Promise<Result<RecomendacionDetalleDto, DomainError>> {
    const areaR = AreaSeleccionada.desdeDto(input.area);
    if (!areaR.ok) return areaR;
    const area = areaR.value;
    const [lat, lon] = area.centro;
    const plazo = this.d.temporizador.esperar(PLAZO_MAXIMO_PETICION_MS);
    const pasos = new Map<PasoCargaId, PasoCargaDto>();
    const marcar = (p: PasoCargaDto) => {
      pasos.set(p.id, p);
      progreso.paso(p);
    };
    marcar(paso("vegetacion", "pendiente"));
    marcar(paso("suelo", "pendiente"));
    const advertencias: string[] = [];
    const vacios: string[] = [];

    const catalogo = await this.d.cultivos.listar();
    const pTerreno = conPlazo(this.d.terreno.analizar(area), plazo);
    const pPresencia = conPlazo(this.d.presencia.obtenerPresencia(lat, lon), plazo);
    const tR = await pTerreno;
    const terreno = tR.vencido ? null : tR.valor;
    if (!terreno) {
      advertencias.push("El análisis del terreno no terminó a tiempo: el detalle sale sin suelo, vegetación ni elevación.");
      vacios.push("Sin datos del terreno (OpenStreetMap, MODIS, SoilGrids, SRTM) por tiempo de espera.");
    } else {
      advertencias.push(...terreno.advertencias);
      vacios.push(...terreno.vaciosInformacion);
    }
    marcar(paso("vegetacion", terreno?.ndvi ? "listo" : "no_disponible"));
    marcar(paso("suelo", terreno?.suelo ? "listo" : "no_disponible"));

    const altitud = terreno?.elevacionM ?? null;
    const pR = await conPlazo(this.d.clima.porUbicacion({ latitud: lat, longitud: lon, altitudM: altitud }, contexto), plazo);
    const perfil = !pR.vencido && pR.valor.ok ? pR.valor.value : null;
    if (!perfil) {
      const motivo = pR.vencido ? "no respondió a tiempo" : (pR.valor as { ok: false; error: DomainError }).error.message;
      advertencias.push("Clima diario de NASA POWER: " + motivo + ".");
      vacios.push("Sin datos de la serie diaria de NASA POWER: no hay clima mes a mes ni estrategias.");
    } else {
      advertencias.push(...perfil.advertencias);
    }

    const prR = await pPresencia;
    const presencia: PresenciaLocal | null = !prR.vencido && prR.valor.ok ? prR.valor.value : null;
    const motorPresencia = crearPresenciaMotor(presencia, catalogo);
    if (!presencia) vacios.push("Sin datos de presencia local de cultivos (EVA / FAOSTAT).");

    let estrategias: EstrategiaDetalleDto[] = [];
    let errorEstrategias: RecomendacionDetalleDto["errorEstrategias"] = null;
    if (perfil && terreno && terreno.aptitud === "apto") {
      const comp = await this.d.motor.comparar(
        {
          area,
          sitio: { tipo: "ubicacion", nombre: null },
          altitudM: terreno.elevacionM,
          fuenteAltitud: null,
          tieneRiego: input.tieneRiego,
          cultivoActual: input.cultivoActual ?? null,
          prioridades: PESOS_OBJETIVO[input.objetivo],
        },
        contexto,
        { terreno, perfil, presencia: motorPresencia },
      );
      if (comp.ok) {
        const fecha = perfil.periodo.desde.slice(0, 4) + "-" + perfil.periodo.hasta.slice(0, 4);
        estrategias = estrategiasDetalle(comp.value.estrategias as never, motorPresencia, fecha);
      } else {
        errorEstrategias = { code: comp.error.code, message: comp.error.message };
      }
    } else if (terreno && terreno.aptitud !== "apto") {
      errorEstrategias = { code: "TERRENO_NO_APTO", message: terreno.mensajeAptitud };
    } else {
      errorEstrategias = { code: "SIN_DATOS", message: "Faltan datos de clima o de terreno para calcular las estrategias." };
    }

    const fuentes: RecomendacionDetalleDto["fuentes"] = [];
    if (perfil) fuentes.push({ fuente: "NASA_POWER", detalle: perfil.fuente + " (" + perfil.periodo.desde.slice(0, 4) + "-" + perfil.periodo.hasta.slice(0, 4) + ")" });
    if (perfil?.calibracion) fuentes.push({ fuente: "IDEAM", detalle: "Estación " + perfil.calibracion.estacion + " (" + perfil.calibracion.periodo + ")" });
    for (const f of terreno?.fuentes ?? []) {
      const id: FuenteDato = /OpenStreetMap/i.test(f) ? "OSM" : /NDVI|MOD13/i.test(f) ? "MODIS_NDVI" : /MCD12|cobertura/i.test(f) ? "MODIS_COBERTURA" : /SoilGrids/i.test(f) ? "SOILGRIDS" : /SRTM|OpenTopo/i.test(f) ? "SRTM" : "NASA_POWER";
      fuentes.push({ fuente: id, detalle: f });
    }
    if (presencia) fuentes.push({ fuente: presencia.fuente, detalle: presencia.ambito + " (" + presencia.periodo + ")" });
    fuentes.push({ fuente: "FAO_ECOCROP", detalle: "Rangos de temperatura, lluvia, pH y ciclo por cultivo (EcoPortCode en cada ficha)" });
    fuentes.push({ fuente: "FAOSTAT", detalle: "Valor bruto de la producción por hectárea (2018-2022)" });

    return Result.ok({
      ubicacion: area.resumen(),
      terreno: terrenoDetalle(terreno),
      climaMensual: climaMensual(perfil),
      calendarioVulnerabilidad: perfil?.calendarioVulnerabilidad ?? [],
      estrategias,
      errorEstrategias,
      pasos: [...pasos.values()],
      fuentes,
      advertencias: [...new Set(advertencias)],
      vaciosInformacion: [...new Set(vacios)],
      aviso: AVISO_RECOMENDACION,
    });
  }
}
