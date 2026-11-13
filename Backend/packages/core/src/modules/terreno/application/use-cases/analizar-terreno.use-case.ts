/**
 * Caso de uso: analizar el terreno de un punto o un área de cualquier lugar del mundo.
 *
 *  1. Valida el área (AreaSeleccionada: ≤ 100 ha, polígono válido).
 *  2. Consulta EN PARALELO: OpenStreetMap (vías, edificaciones, agua), MODIS MCD12Q1 (cobertura),
 *     MODIS MOD13Q1 (NDVI de los últimos años), SoilGrids (suelo), SRTM (elevación y pendiente) y
 *     NASA POWER (humedad del suelo).
 *  3. Decide la aptitud con reglas puras (es carretera / edificación / agua / uso del suelo).
 *  4. Arma el perfil con fuentes y vacíos de información.
 *
 * Un proveedor caído NUNCA produce un error: el perfil sale igual, con advertencia y vacío de información.
 * Solo lectura: no muta estado, así que no audita (Regla 6).
 */
import type { AnalizarTerrenoInput, CoberturaDto, NdviDto, PerfilTerrenoDto, SueloDto } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import { AreaSeleccionada } from "../../../../shared/domain/geo/area-seleccionada.vo.ts";
import { CLASES_IGBP, decidirAptitud, evaluarAfectacion, type ResultadoAfectacion } from "../../domain/services/aptitud-terreno.service.ts";
import { analizarNdvi } from "../../domain/services/ndvi.service.ts";
import { calcularPendientePct, clasificarTextura, puntosParaPendiente } from "../../domain/services/suelo-relieve.service.ts";
import type {
  ContextoSolicitud,
  ICoberturaProvider,
  IElevacionProvider,
  IHumedadSueloProvider,
  INdviProvider,
  IReloj,
  ISueloProvider,
  IViasProvider,
} from "../ports/index.ts";

/** Años completos de NDVI que se analizan (más lo que va del año actual). */
export const ANIOS_NDVI = 5;
/** Margen alrededor del área para buscar vías (m): cubre el semiancho de una autopista con holgura. */
export const MARGEN_BUSQUEDA_VIAS_M = 60;

export interface ProveedoresTerreno {
  vias: IViasProvider;
  cobertura: ICoberturaProvider;
  ndvi: INdviProvider;
  suelo: ISueloProvider;
  elevacion: IElevacionProvider;
  humedad: IHumedadSueloProvider;
  reloj: IReloj;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export class AnalizarTerrenoUseCase {
  constructor(private readonly p: ProveedoresTerreno) {}

  async execute(input: AnalizarTerrenoInput, _contexto: ContextoSolicitud): Promise<Result<PerfilTerrenoDto, DomainError>> {
    const areaR = AreaSeleccionada.desdeDto(input.area);
    if (!areaR.ok) return areaR;
    return Result.ok(await this.analizar(areaR.value));
  }

  /** Análisis para un área ya validada (lo reutilizan rotaciones e impresión). */
  async analizar(area: AreaSeleccionada): Promise<PerfilTerrenoDto> {
    const [lat, lon] = area.centro;
    const hoy = this.p.reloj.hoy();
    const hasta = hoy.toISOString().slice(0, 10);
    const desde = hoy.getUTCFullYear() - ANIOS_NDVI + "-01-01";
    const puntosRelieve = puntosParaPendiente(area.centro);

    const [viasR, coberturaR, ndviR, sueloR, elevR, humedadR] = await Promise.all([
      this.p.vias.obtenerElementos(area.caja(MARGEN_BUSQUEDA_VIAS_M)),
      this.p.cobertura.obtenerCobertura(lat, lon),
      this.p.ndvi.obtenerSerie(lat, lon, desde, hasta),
      this.p.suelo.obtenerPropiedades(lat, lon),
      this.p.elevacion.obtenerElevaciones(puntosRelieve),
      this.p.humedad.obtenerClimatologia(lat, lon),
    ]);

    const fuentes: string[] = [];
    const vacios: string[] = [];
    const advertencias: string[] = [];
    const caido = (que: string, e: DomainError) => advertencias.push(que + ": " + e.message);

    // Vías, edificaciones y agua (OpenStreetMap)
    let afectacion: ResultadoAfectacion | null = null;
    if (viasR.ok) {
      afectacion = evaluarAfectacion(area, viasR.value);
      fuentes.push(viasR.value.fuente);
    } else {
      caido("Vías y edificaciones", viasR.error);
      vacios.push("No se pudo verificar en OpenStreetMap si el sitio cruza vías, edificaciones o agua.");
    }

    // Cobertura MODIS
    let cobertura: CoberturaDto | null = null;
    if (coberturaR.ok && coberturaR.value) {
      const clase = CLASES_IGBP[coberturaR.value.claseIgbp];
      if (clase) {
        cobertura = {
          claseIgbp: coberturaR.value.claseIgbp,
          nombre: clase.nombre,
          categoria: clase.categoria,
          anio: coberturaR.value.anio,
          fuente: coberturaR.value.fuente,
        };
        fuentes.push(coberturaR.value.fuente);
      }
    } else if (!coberturaR.ok) {
      caido("Cobertura MODIS", coberturaR.error);
    }
    if (!cobertura) vacios.push("Sin cobertura del suelo MODIS (MCD12Q1) para este punto: no se verificó si es urbano, bosque o agua.");

    // Aptitud
    const decision = decidirAptitud(area.tipo, afectacion?.afectacion ?? null, cobertura?.categoria ?? null, cobertura?.nombre ?? null);
    advertencias.push(...decision.advertencias);

    // NDVI
    let ndvi: NdviDto | null = null;
    if (ndviR.ok && ndviR.value.muestras.length > 0) {
      ndvi = analizarNdvi(ndviR.value.muestras, ndviR.value.fuente, desde, hasta);
      fuentes.push(ndviR.value.fuente);
    } else {
      if (!ndviR.ok) caido("NDVI MODIS", ndviR.error);
      vacios.push("Sin serie NDVI (MODIS MOD13Q1): no se pudieron calcular los meses baldíos ni el estrés de la vegetación.");
    }

    // Suelo
    let suelo: SueloDto | null = null;
    if (sueloR.ok && sueloR.value) {
      suelo = { ...sueloR.value, textura: clasificarTextura(sueloR.value.arenaPct, sueloR.value.arcillaPct) };
      fuentes.push(sueloR.value.fuente);
    } else {
      if (!sueloR.ok) caido("Suelo (SoilGrids)", sueloR.error);
      vacios.push(
        "Sin datos de suelo (textura, pH, carbono, nitrógeno): ISRIC SoilGrids no respondió o no tiene dato aquí. " +
          "Un análisis de suelo del lote es lo más recomendable.",
      );
    }

    // Elevación y pendiente
    let elevacionM: number | null = null;
    let pendientePct: number | null = null;
    if (elevR.ok) {
      const centro = elevR.value.elevacionesM[0] ?? null;
      elevacionM = centro === null ? null : Math.round(centro);
      pendientePct = calcularPendientePct(elevR.value.elevacionesM);
      if (elevacionM !== null) fuentes.push(elevR.value.fuente);
    } else {
      caido("Elevación (SRTM)", elevR.error);
    }
    if (elevacionM === null) vacios.push("Sin elevación SRTM: se usará la altitud de la celda del clima o la que indique el usuario.");
    if (pendientePct === null) vacios.push("Sin pendiente del terreno (requiere elevación SRTM de puntos vecinos).");
    if (area.tipo === "poligono" && pendientePct !== null) {
      advertencias.push("La pendiente se calcula en el centro del lote (" + r1(pendientePct) + " %); puede variar dentro del área.");
    }

    // Humedad del suelo
    let humedadSuelo: PerfilTerrenoDto["humedadSuelo"] = null;
    if (humedadR.ok) {
      humedadSuelo = humedadR.value.meses;
      fuentes.push(humedadR.value.fuente);
    } else {
      caido("Humedad del suelo (NASA POWER)", humedadR.error);
      vacios.push("Sin humedad del suelo mensual (NASA POWER GWET).");
    }

    vacios.push("No se conoce el historial de cultivos ni de plagas del lote: lo aporta el agricultor.");

    return {
      ubicacion: area.resumen(),
      aptitud: decision.aptitud,
      mensajeAptitud: decision.mensaje,
      afectacion: afectacion?.afectacion ?? { carreteraPct: 0, edificacionPct: 0, aguaPct: 0, excluidoPct: 0, puntosMuestreados: 0 },
      viasCercanas: afectacion?.viasCercanas ?? [],
      elevacionM,
      pendientePct,
      suelo,
      humedadSuelo,
      ndvi,
      cobertura,
      fuentes: [...new Set(fuentes)],
      vaciosInformacion: [...new Set(vacios)],
      advertencias,
    };
  }
}
