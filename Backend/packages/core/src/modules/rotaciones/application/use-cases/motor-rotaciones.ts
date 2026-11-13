/**
 * Servicio de aplicación: motor común de la comparación de rotaciones (finca guardada o cualquier lugar).
 *
 *  1. Terreno: si el sitio no es apto ("No se puede sembrar: es carretera"...) → error, sin rotaciones.
 *  2. Altitud de referencia: la del usuario / finca, si no SRTM, si no la celda del clima.
 *  3. Perfil climático (temporadas derivadas, vulnerabilidad).
 *  4. Ventanas de la rotación en las temporadas reales (secano o, con riego, con riego).
 *  5. Estrategias: A (actual, sin corregir; solo si hay cultivo actual), B (suelo), C (forraje / ingreso), D (agua, si
 *     prioridad agua ≥ 4, hay déficit hídrico o no hay cultivo actual); siempre distintas y siempre ≥ 3.
 *     La búsqueda es exacta (ramificación y acotamiento, ver generar-estrategias.service.ts).
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
import { PRESENCIA_DESCONOCIDA, type PresenciaMotor, calcularEscalaIngreso } from "../../domain/services/presencia-motor.ts";
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
  type SecuenciaEvaluada,
} from "../../domain/services/generar-estrategias.service.ts";
import { explicarEstrategia, NOMBRES_ESTRATEGIA } from "../../domain/services/explicar-estrategia.service.ts";
import { construirVentanas } from "../../domain/services/ventanas-rotacion.service.ts";
import { construirCalendario, detectarOportunidades } from "../../domain/services/calendario-oportunidades.service.ts";
import { ENFOQUES_ROTACION } from "../../domain/services/enfoques-rotacion.ts";
import type { ContextoSolicitud, IAnalisisTerrenoQuery, ICultivoRepository, IPerfilClimaticoQuery } from "../ports/index.ts";
import { FRACCION_ET0_SECANO } from "../../../clima/domain/services/temporadas-cultivo.service.ts";
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
  /** Clave del cultivo actual, o null si el lote no declara uno (no se calcula la estrategia A). */
  cultivoActual: string | null;
  secuenciaActual?: string[];
  prioridades: PrioridadesRotacion;
}

/** Datos que el llamador ya tiene: evitan repetir las consultas de terreno, clima o presencia local. */
export interface PreviosComparacion {
  terreno?: PerfilTerrenoDto;
  perfil?: PerfilClimaticoDto;
  presencia?: PresenciaMotor;
}

interface EntradaCalculo {
  datos: DatosComparacion;
  ctx: ContextoMotor;
  perfil: PerfilClimaticoDto;
  terreno: PerfilTerrenoDto;
  temporadas: TemporadaCultivoDto[];
  ventanas: VentanaRotacionDto[];
  /** Cultivo principal del lote, o null si no hay cultivo actual. */
  principal: Cultivo | null;
  actuales: Cultivo[];
  catalogo: Cultivo[];
  advertencias: string[];
  altitudM: number | null;
  fuenteAltitud: ComparacionRotacionesDto["sitio"]["fuenteAltitud"];
}

export class MotorRotaciones {
  constructor(
    private readonly cultivos: ICultivoRepository,
    private readonly perfilClimatico: IPerfilClimaticoQuery,
    private readonly terreno: IAnalisisTerrenoQuery,
    private readonly medidor: IMedidorTiempos = MEDIDOR_NULO,
  ) {}

  /**
   * @param previos terreno, perfil climático y presencia local que el llamador ya consultó (no se repiten las consultas).
   */
  async comparar(
    datos: DatosComparacion,
    contexto: ContextoSolicitud,
    previos?: PreviosComparacion,
  ): Promise<Result<ComparacionRotacionesDto, DomainError>> {
    // 0. Catálogo y secuencia actual (antes de consultar proveedores lentos)
    const catalogo = await this.cultivos.listar();
    const porClave = new Map<string, Cultivo>(catalogo.map((c) => [c.clave, c]));
    // Sin cultivo actual no hay estrategia A: se ignora cualquier secuencia declarada.
    const clavesActuales = datos.cultivoActual === null ? [] : datos.secuenciaActual?.length ? datos.secuenciaActual : [datos.cultivoActual];
    const actuales: Cultivo[] = [];
    for (const clave of clavesActuales) {
      const c = porClave.get(clave);
      if (!c) return Result.err(new RotacionCultivoDesconocidoError(clave));
      actuales.push(c);
    }
    const principal = actuales[0] ?? null;

    // 1. Terreno
    const terreno = previos?.terreno ?? await this.terreno.analizar(datos.area);
    if (terreno.aptitud !== "apto") return Result.err(new TerrenoNoAptoError(terreno.aptitud, terreno.mensajeAptitud));

    // 2. Altitud
    let altitudM = datos.altitudM;
    let fuenteAltitud: ComparacionRotacionesDto["sitio"]["fuenteAltitud"] = datos.fuenteAltitud ?? "clima";
    if (altitudM === null && terreno.elevacionM !== null) {
      altitudM = terreno.elevacionM;
      fuenteAltitud = "srtm";
    }

    // 3. Clima
    let perfil: PerfilClimaticoDto;
    if (previos?.perfil) {
      perfil = previos.perfil;
    } else {
      const perfilR = await this.perfilClimatico.porUbicacion(
        { latitud: datos.area.latitud, longitud: datos.area.longitud, altitudM },
        contexto,
        datos.sitio.fincaId,
      );
      if (!perfilR.ok) return Result.err(perfilR.error);
      perfil = perfilR.value;
    }
    if (altitudM === null) fuenteAltitud = "clima";
    const advertencias: string[] = [];

    // 4. Ventanas en temporadas reales
    let temporadas = datos.tieneRiego ? perfil.temporadasCultivo.conRiego : perfil.temporadasCultivo.secano;
    if (temporadas.length === 0 && !datos.tieneRiego && perfil.temporadasCultivo.conRiego.length > 0) {
      temporadas = perfil.temporadasCultivo.conRiego;
      advertencias.push(
        "El clima no tiene temporada de secano (lluvia < " + FRACCION_ET0_SECANO * 100 + " % de la ET0 en todos los meses aptos por temperatura): " +
          "las ventanas usan la temporada térmica y casi todo cultivo dependerá del riego.",
      );
    }
    if (temporadas.length === 0) return Result.err(new RotacionSinTemporadasError());
    const ventanas = construirVentanas(temporadas);

    const presencia = previos?.presencia ?? PRESENCIA_DESCONOCIDA;
    const ctx: ContextoMotor = {
      perfil,
      ventanas,
      tieneRiego: datos.tieneRiego,
      suelo: { ph: terreno.suelo?.ph ?? null, textura: terreno.suelo?.textura ?? null },
      pendientePct: terreno.pendientePct,
      mesesBaldios: terreno.ndvi?.mesesBaldios ?? [],
      excluidoPct: terreno.afectacion.excluidoPct,
      presencia,
      escalaIngreso: calcularEscalaIngreso(catalogo, presencia) ?? undefined,
    };

    return this.medidor.medirSync("motor", () =>
      this.calcular({ datos, ctx, perfil, terreno, temporadas, ventanas, principal, actuales, catalogo, advertencias, altitudM, fuenteAltitud })
    );
  }

  /** Búsqueda de estrategias, textos, calendario y oportunidades (síncrono y puro: lo mide el medidor como "motor"). */
  private calcular(e: EntradaCalculo): Result<ComparacionRotacionesDto, DomainError> {
    const { datos, ctx, perfil, terreno, temporadas, ventanas, principal, actuales, catalogo, advertencias, altitudM, fuenteAltitud } = e;
    // 5A. Estrategia actual, sin corregir (solo si hay cultivo actual): cultivos declarados en las ventanas de temporada;
    //     barbecho en el intervalo.
    let evalA: SecuenciaEvaluada | null = null;
    const excluir: string[] = [];
    if (principal) {
      evalA = evaluarSecuencia(this.secuenciaActual(actuales, ctx), ctx, datos.prioridades);
      excluir.push(claveSecuencia(evalA.claves));
    }

    // 5B. Suelo (incluye el cultivo principal si es viable)
    let requerirClave: string | undefined = principal?.clave;
    if (principal && !esViableEnAlgunaVentana(principal, ctx)) {
      requerirClave = undefined;
      advertencias.push(
        "El cultivo actual (" + principal.nombre + ") no es viable en ninguna ventana con el clima calculado (temperatura, helada, calor, " +
          "agua o ciclo): las estrategias alternativas no lo incluyen.",
      );
    }
    const soloAnuales = !principal?.perenne;
    let evalB = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES_ROTACION.B.opciones, requerirClave, soloAnuales, excluirSecuencias: excluir });
    if (!evalB && requerirClave && principal) {
      advertencias.push("Ninguna rotación válida incluye " + principal.nombre + " con las reglas duras: la estrategia B se calculó sin exigirlo.");
      evalB = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES_ROTACION.B.opciones, soloAnuales, excluirSecuencias: excluir });
    }
    if (!evalB) evalB = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES_ROTACION.B.opciones, excluirSecuencias: excluir });
    if (!evalB) {
      return Result.err(new RotacionSinAlternativasError("ninguna secuencia cumple a la vez temperatura, helada, calor, agua, ciclo, familia y leguminosa"));
    }
    excluir.push(claveSecuencia(evalB.claves));

    // 5C. Forraje / ingreso: el primer cultivo sembrado no es "poco común" en la zona si existe una alternativa viable.
    let evalC: SecuenciaEvaluada | null = null;
    for (const evitarPocoComunPrimero of [true, false]) {
      evalC = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, {
        ...ENFOQUES_ROTACION.C.opciones, soloAnuales, excluirSecuencias: excluir, evitarPocoComunPrimero,
      }) ?? buscarMejorSecuencia(catalogo, ctx, datos.prioridades, {
        ...ENFOQUES_ROTACION.C.opciones, excluirSecuencias: excluir, evitarPocoComunPrimero,
      });
      if (evalC) break;
    }
    if (!evalC) return Result.err(new RotacionSinAlternativasError("no hay una tercera secuencia válida distinta de la actual y de la estrategia B"));
    excluir.push(claveSecuencia(evalC.claves));

    // 5D. Agua: si la prioridad de agua es alta, hay déficit hídrico o no hay estrategia A (para tener siempre ≥ 3).
    let evalD: SecuenciaEvaluada | null = null;
    if (!evalA || datos.prioridades.agua >= PRIORIDAD_AGUA_ESTRATEGIA_D || perfil.resumen.mesesDeficitHidrico.length > 0) {
      evalD = buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES_ROTACION.D.opciones, soloAnuales, excluirSecuencias: excluir }) ??
        buscarMejorSecuencia(catalogo, ctx, datos.prioridades, { ...ENFOQUES_ROTACION.D.opciones, excluirSecuencias: excluir });
      if (!evalD && !evalA) {
        return Result.err(new RotacionSinAlternativasError("no hay una tercera secuencia válida distinta de las estrategias B y C"));
      }
    }

    // 6. Textos
    const secuenciaAsumida = !datos.secuenciaActual?.length;
    const construir = (id: IdEstrategia, enfoque: EnfoqueEstrategia, s: SecuenciaEvaluada): EstrategiaRotacionDto => {
      const t = explicarEstrategia({ id, secuencia: s, ctx, clavePrincipal: principal?.clave ?? null, secuenciaAsumida: id === "A" && secuenciaAsumida });
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
    const estrategias: EstrategiaRotacionDto[] = [];
    if (evalA) estrategias.push(construir("A", "actual", evalA));
    estrategias.push(construir("B", "suelo", evalB), construir("C", "forraje", evalC));
    if (evalD) estrategias.push(construir("D", "agua", evalD));

    // Mejor puntuada: en empate gana B, luego C, D y A.
    let mejor: IdEstrategia = "B";
    let mejorTotal = estrategias.find((x) => x.id === "B")!.puntajeTotal;
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
        // Sin cultivo actual el contrato exige texto: va vacío (el contrato debería aceptar null).
        cultivoActual: principal?.clave ?? null,
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
