/**
 * Servicio de aplicación: motor común de la comparación de rotaciones (finca guardada o cualquier lugar).
 *
 *  1. Terreno: si el sitio no es apto ("No se puede sembrar: es carretera"...) → error, sin rotaciones.
 *  2. Altitud de referencia: la del usuario / finca, si no SRTM, si no la celda del clima.
 *  3. Perfil climático (temporadas derivadas, vulnerabilidad).
 *  4. Ventanas de la rotación en las temporadas reales (secano o, con riego, con riego).
 *  5. Estrategias: A (actual, sin corregir), B (suelo), C (forraje / ingreso), D (agua, si prioridad agua ≥ 4 o
 *     hay déficit hídrico); siempre distintas.
 *  6. Explicación, calendario de 12 meses y oportunidades.
 *
 * Solo lectura: no muta estado, así que no audita (Regla 6). Los servicios de dominio son puros y deterministas.
 */
import type {
  ComparacionRotacionesDto,
  EnfoqueEstrategia,
  EstrategiaRotacionDto,
  IdEstrategia,
  PerfilClimaticoDto,
  PerfilTerrenoDto,
  PrioridadesRotacion,
  TemporadaCultivoDto,
  VentanaRotacionDto,
} from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import type { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import {
  RotacionCultivoDesconocidoError,
  RotacionSinAlternativasError,
  RotacionSinTemporadasError,
  TerrenoNoAptoError,
} from "../../domain/errors/rotacion.errors.ts";
import { type ContextoMotor, type ElementoSecuencia, type PasoEvaluado, totalPasos, ventanaDe } from "../../domain/services/evaluar-paso.service.ts";
import {
  buscarMejorSecuencia,
  claveSecuencia,
  esViableEnAlgunaVentana,
  evaluarSecuencia,
  type OpcionesBusqueda,
  type SecuenciaEvaluada,
} from "../../domain/services/generar-estrategias.service.ts";
import { explicarEstrategia, NOMBRES_ESTRATEGIA } from "../../domain/services/explicar-estrategia.service.ts";
import { construirVentanas } from "../../domain/services/ventanas-rotacion.service.ts";
import { construirCalendario, detectarOportunidades } from "../../domain/services/calendario-oportunidades.service.ts";
import { puntajeIngresoReferencia } from "../../domain/services/referencias-ingreso.ts";
import type { ContextoSolicitud, IAnalisisTerrenoQuery, ICultivoRepository, IPerfilClimaticoQuery } from "../ports/index.ts";
import { type IMedidorTiempos, MEDIDOR_NULO } from "../../../../shared/application/ports/medidor-tiempos.port.ts";

export const AVISO_ROTACIONES =
  "Esta comparación sugiere y explica con los datos disponibles; no reemplaza el criterio del agricultor ni la recomendación de un agrónomo local.";

/** Prioridad de agua a partir de la cual siempre se propone la estrategia D. */
export const PRIORIDAD_AGUA_ESTRATEGIA_D = 4;

export interface DatosComparacion {
  area: AreaSeleccionada;
  sitio: { tipo: "finca" | "ubicacion"; fincaId: number | null; nombre: string | null };
  /** Altitud conocida (de la finca o del usuario), o null. */
  altitudM: number | null;
  fuenteAltitud: "finca" | "usuario" | null;
  tieneRiego: boolean;
  cultivoActual: string;
  secuenciaActual?: string[];
  prioridades: PrioridadesRotacion;
}

interface EntradaCalculo {
  datos: DatosComparacion;
  ctx: ContextoMotor;
  perfil: PerfilClimaticoDto;
  terreno: PerfilTerrenoDto;
  temporadas: TemporadaCultivoDto[];
  ventanas: VentanaRotacionDto[];
  principal: Cultivo;
  actuales: Cultivo[];
  catalogo: Cultivo[];
  advertencias: string[];
  altitudM: number | null;
  fuenteAltitud: ComparacionRotacionesDto["sitio"]["fuenteAltitud"];
}

const NIVEL = { baja: 0, media: 1, alta: 2 } as const;
const COB = { baja: 20, media: 55, alta: 90 } as const;
const FOR = { ninguno: 0, bajo: 25, medio: 60, alto: 100 } as const;
const AGUA = { baja: 100, media: 60, alta: 25 } as const;

/**
 * Premio (0–25 puntos) por la fracción de pasos con temperatura ÓPTIMA: un cultivo solo "posible" (fuera del óptimo
 * ECOCROP) rinde menos; sin este premio el motor elegía cultivos de clima cálido en el altiplano por su forraje.
 */
export const BONO_APTITUD_OPTIMA = 25;
function bonoAptitud(s: SecuenciaEvaluada): number {
  const conCultivo = s.pasos.filter((p) => p.aptitudClima !== null);
  return conCultivo.length ? (conCultivo.filter((p) => p.aptitudClima === "optima").length / conCultivo.length) * BONO_APTITUD_OPTIMA : 0;
}

/** Penaliza pH o textura incompatibles (solo si se conoce el suelo). */
function penalizacionSuelo(s: SecuenciaEvaluada): number {
  return s.reglas.find((r) => r.regla === "suelo_compatible")?.cumple === false ? 6 : 0;
}

const heuristicaBase = (ev: PasoEvaluado) => (ev.paso.aptitudClima === "optima" ? 30 : 0) - (ev.paso.riesgoHelada === "moderado" ? 5 : 0);

const ENFOQUES: Record<Exclude<IdEstrategia, "A">, { enfoque: EnfoqueEstrategia; opciones: Pick<OpcionesBusqueda, "puntuar" | "heuristica"> }> = {
  B: {
    enfoque: "suelo",
    opciones: {
      puntuar: (s) => 0.5 * s.puntajes.suelo + 0.3 * s.puntajes.plagas + 0.2 * s.puntajeTotal + bonoAptitud(s) - penalizacionSuelo(s),
      heuristica: (c, ev) => 0.5 * COB[c.coberturaSuelo] + 30 * Number(c.fijaNitrogeno) + 10 * NIVEL[c.profundidadRaiz === "profunda" ? "alta" : "baja"] + heuristicaBase(ev),
    },
  },
  C: {
    enfoque: "forraje",
    opciones: {
      puntuar: (s) => 0.4 * s.puntajes.forraje + 0.3 * s.puntajes.ingreso + 0.3 * s.puntajeTotal + bonoAptitud(s) - penalizacionSuelo(s),
      heuristica: (c, ev) => 0.5 * FOR[c.valorForrajero] + 0.4 * puntajeIngresoReferencia(c.clave, c.grupo) + 10 * Number(c.fijaNitrogeno) + heuristicaBase(ev),
    },
  },
  D: {
    enfoque: "agua",
    opciones: {
      puntuar: (s) => 0.6 * s.puntajes.agua + 0.2 * s.puntajes.suelo + 0.2 * s.puntajeTotal + bonoAptitud(s) - penalizacionSuelo(s),
      heuristica: (c, ev) => 0.6 * AGUA[c.necesidadAgua] + 15 * NIVEL[c.toleranciaSequia] + 10 * Number(c.fijaNitrogeno) - ev.paso.deficitAguaMm / 10 + heuristicaBase(ev),
    },
  },
};

export class MotorRotaciones {
  constructor(
    private readonly cultivos: ICultivoRepository,
    private readonly perfilClimatico: IPerfilClimaticoQuery,
    private readonly terreno: IAnalisisTerrenoQuery,
    private readonly medidor: IMedidorTiempos = MEDIDOR_NULO,
  ) {}

  async comparar(datos: DatosComparacion, contexto: ContextoSolicitud): Promise<Result<ComparacionRotacionesDto, DomainError>> {
    // 0. Catálogo y secuencia actual (antes de consultar proveedores lentos)
    const catalogo = await this.cultivos.listar();
    const porClave = new Map<string, Cultivo>(catalogo.map((c) => [c.clave, c]));
    const clavesActuales = datos.secuenciaActual?.length ? datos.secuenciaActual : [datos.cultivoActual];
    const actuales: Cultivo[] = [];
    for (const clave of clavesActuales) {
      const c = porClave.get(clave);
      if (!c) return Result.err(new RotacionCultivoDesconocidoError(clave));
      actuales.push(c);
    }
    const principal = actuales[0];

    // 1. Terreno
    const terreno = await this.terreno.analizar(datos.area);
    if (terreno.aptitud !== "apto") return Result.err(new TerrenoNoAptoError(terreno.aptitud, terreno.mensajeAptitud));

    // 2. Altitud
    let altitudM = datos.altitudM;
    let fuenteAltitud: ComparacionRotacionesDto["sitio"]["fuenteAltitud"] = datos.fuenteAltitud ?? "clima";
    if (altitudM === null && terreno.elevacionM !== null) {
      altitudM = terreno.elevacionM;
      fuenteAltitud = "srtm";
    }

    // 3. Clima
    const perfilR = await this.perfilClimatico.porUbicacion(
      { latitud: datos.area.latitud, longitud: datos.area.longitud, altitudM },
      contexto,
      datos.sitio.fincaId,
    );
    if (!perfilR.ok) return Result.err(perfilR.error);
    const perfil = perfilR.value;
    if (altitudM === null) fuenteAltitud = "clima";
    const advertencias: string[] = [];

    // 4. Ventanas en temporadas reales
    let temporadas = datos.tieneRiego ? perfil.temporadasCultivo.conRiego : perfil.temporadasCultivo.secano;
    if (temporadas.length === 0 && !datos.tieneRiego && perfil.temporadasCultivo.conRiego.length > 0) {
      temporadas = perfil.temporadasCultivo.conRiego;
      advertencias.push(
        "El clima no tiene temporada de secano (lluvia < 50 % de la ET0 en todos los meses aptos por temperatura): " +
          "las ventanas usan la temporada térmica y casi todo cultivo dependerá del riego.",
      );
    }
    if (temporadas.length === 0) return Result.err(new RotacionSinTemporadasError());
    const ventanas = construirVentanas(temporadas);

    const ctx: ContextoMotor = {
      perfil,
      ventanas,
      tieneRiego: datos.tieneRiego,
      suelo: { ph: terreno.suelo?.ph ?? null, textura: terreno.suelo?.textura ?? null },
      pendientePct: terreno.pendientePct,
      mesesBaldios: terreno.ndvi?.mesesBaldios ?? [],
      excluidoPct: terreno.afectacion.excluidoPct,
    };

    return this.medidor.medirSync("motor", () =>
      this.calcular({ datos, ctx, perfil, terreno, temporadas, ventanas, principal, actuales, catalogo, advertencias, altitudM, fuenteAltitud })
    );
  }

  /** Búsqueda de estrategias, textos, calendario y oportunidades (síncrono y puro: lo mide el medidor como "motor"). */
  private calcular(e: EntradaCalculo): Result<ComparacionRotacionesDto, DomainError> {
    const { datos, ctx, perfil, terreno, temporadas, ventanas, principal, actuales, catalogo, advertencias, altitudM, fuenteAltitud } = e;
    // 5A. Estrategia actual, sin corregir: cultivos actuales en las ventanas de temporada; barbecho en el intervalo.
    const elementosA = this.secuenciaActual(actuales, ctx);
    const evalA = evaluarSecuencia(elementosA, ctx, datos.prioridades);
    const excluir = [claveSecuencia(evalA.claves)];

    // 5B. Suelo (incluye el cultivo principal si es viable)
    let requerirClave: string | undefined = principal.clave;
    if (!esViableEnAlgunaVentana(principal, ctx)) {
      requerirClave = undefined;
      advertencias.push(
        "El cultivo actual (" + principal.nombre + ") no es viable en ninguna ventana con el clima calculado (temperatura, helada, calor, " +
          "agua o ciclo): las estrategias alternativas no lo incluyen.",
      );
    }
    const soloAnuales = !principal.perenne;
    let evalB = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES.B.opciones, requerirClave, soloAnuales, excluirSecuencias: excluir });
    if (!evalB && requerirClave) {
      advertencias.push("Ninguna rotación válida incluye " + principal.nombre + " con las reglas duras: la estrategia B se calculó sin exigirlo.");
      evalB = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES.B.opciones, soloAnuales, excluirSecuencias: excluir });
    }
    if (!evalB) evalB = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES.B.opciones, excluirSecuencias: excluir });
    if (!evalB) {
      return Result.err(new RotacionSinAlternativasError("ninguna secuencia cumple a la vez temperatura, helada, calor, agua, ciclo, familia y leguminosa"));
    }
    excluir.push(claveSecuencia(evalB.claves));

    // 5C. Forraje / ingreso
    let evalC = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES.C.opciones, soloAnuales, excluirSecuencias: excluir });
    if (!evalC) evalC = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES.C.opciones, excluirSecuencias: excluir });
    if (!evalC) return Result.err(new RotacionSinAlternativasError("no hay una tercera secuencia válida distinta de la actual y de la estrategia B"));
    excluir.push(claveSecuencia(evalC.claves));

    // 5D. Agua (opcional)
    let evalD: SecuenciaEvaluada | null = null;
    if (datos.prioridades.agua >= PRIORIDAD_AGUA_ESTRATEGIA_D || perfil.resumen.mesesDeficitHidrico.length > 0) {
      evalD = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES.D.opciones, soloAnuales, excluirSecuencias: excluir }) ??
        buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES.D.opciones, excluirSecuencias: excluir });
    }

    // 6. Textos
    const secuenciaAsumida = !datos.secuenciaActual?.length;
    const construir = (id: IdEstrategia, enfoque: EnfoqueEstrategia, s: SecuenciaEvaluada): EstrategiaRotacionDto => {
      const t = explicarEstrategia({ id, secuencia: s, ctx, clavePrincipal: principal.clave, secuenciaAsumida: id === "A" && secuenciaAsumida });
      return {
        id,
        enfoque,
        nombre: NOMBRES_ESTRATEGIA[id],
        secuencia: s.pasos,
        porQue: t.porQue,
        evidencia: t.evidencia,
        beneficios: t.beneficios,
        vaciosInformacion: t.vaciosInformacion,
        riesgos: t.riesgos,
        reglas: s.reglas,
        puntajes: s.puntajes,
        puntajeTotal: s.puntajeTotal,
      };
    };
    const estrategias = [construir("A", "actual", evalA), construir("B", "suelo", evalB), construir("C", "forraje", evalC)];
    if (evalD) estrategias.push(construir("D", "agua", evalD));

    // Mejor puntuada: en empate gana B, luego C, D y A.
    let mejor: IdEstrategia = "B";
    let mejorTotal = estrategias[1].puntajeTotal;
    for (const id of ["B", "C", "D", "A"] as IdEstrategia[]) {
      const e = estrategias.find((x) => x.id === id);
      if (e && e.puntajeTotal > mejorTotal) {
        mejor = id;
        mejorTotal = e.puntajeTotal;
      }
    }

    const oportunidades = detectarOportunidades({ ctx, catalogo, actual: evalA, estrategias });
    const calendario = construirCalendario(ctx, evalA, oportunidades);

    return Result.ok({
      sitio: {
        tipo: datos.sitio.tipo,
        fincaId: datos.sitio.fincaId,
        nombre: datos.sitio.nombre,
        ubicacion: datos.area.resumen(),
        altitudReferenciaM: altitudM ?? perfil.altitudReferenciaM,
        fuenteAltitud,
        tieneRiego: datos.tieneRiego,
        cultivoActual: principal.clave,
        clasificacionClimatica: perfil.resumen.clasificacionClimatica,
      },
      terreno: this.resumenTerreno(terreno),
      prioridades: datos.prioridades,
      clima: {
        fuente: perfil.fuente,
        calibrado: perfil.calibracion !== null,
        lluviaAnualMm: perfil.resumen.lluviaAnualMm,
        etoAnualMm: perfil.resumen.etoAnualMm,
        regimenLluvias: perfil.resumen.regimenLluvias,
        mesesLluviosos: perfil.resumen.mesesLluviosos,
        mesesRiesgoHelada: perfil.resumen.mesesRiesgoHelada,
        mesesCalor: perfil.resumen.mesesCalor,
        mesesDeficitHidrico: perfil.resumen.mesesDeficitHidrico,
      },
      temporadas,
      ventanas,
      calendario,
      estrategias,
      estrategiaMejorPuntuada: mejor,
      oportunidades,
      advertencias: [...new Set([...advertencias, ...terreno.advertencias, ...perfil.advertencias])],
      aviso: AVISO_ROTACIONES,
    });
  }

  /**
   * Estrategia A tal cual: los cultivos declarados, en ciclo, en las ventanas de TEMPORADA; barbecho en el intervalo.
   * Si un cultivo largo no cabe en su ventana y el siguiente paso es el mismo cultivo, se toma como continuación.
   */
  private secuenciaActual(actuales: Cultivo[], ctx: ContextoMotor): ElementoSecuencia[] {
    const out: ElementoSecuencia[] = [];
    let i = 0;
    for (let orden = 1; orden <= totalPasos(ctx); orden++) {
      if (ventanaDe(orden, ctx).tipo === "intervalo") {
        out.push({ cultivo: null, continua: false });
        continue;
      }
      const c = actuales[i % actuales.length];
      i++;
      const previo = out[out.length - 1];
      const continua = !!previo?.cultivo && previo.cultivo.clave === c.clave &&
        (c.perenne || c.mesesCicloMedio > ventanaDe(orden - 1, ctx).meses.length) && !previo.continua;
      out.push({ cultivo: c, continua });
    }
    return out;
  }

  private resumenTerreno(t: PerfilTerrenoDto): ComparacionRotacionesDto["terreno"] {
    return {
      aptitud: t.aptitud,
      mensajeAptitud: t.mensajeAptitud,
      excluidoPct: t.afectacion.excluidoPct,
      pendientePct: t.pendientePct,
      textura: t.suelo?.textura ?? null,
      ph: t.suelo?.ph ?? null,
      mesesBaldios: t.ndvi?.mesesBaldios ?? [],
      fuentes: t.fuentes,
    };
  }
}
