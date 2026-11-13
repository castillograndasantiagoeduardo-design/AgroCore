/**
 * Tipos de vista, objetivos agronómicos, épocas del año y constantes de presentación del módulo explorar.
 */
import type {
  AreaSeleccionadaDto,
  ComparacionRotacionesDto,
  EstrategiaRotacionDto,
  PasoRotacionDto,
  PerfilTerrenoDto,
  PrioridadRotacion,
  PrioridadesRotacion,
  ReglaRotacion,
  TipoOportunidad,
} from "@agrocore/contracts";

export type ObjetivoPrincipal = "equilibrado" | "suelo" | "agua" | "ingreso";

export type EpocaConsulta = "actual" | "primera_epoca" | "segunda_epoca";

export interface DefinicionObjetivo {
  id: ObjetivoPrincipal;
  nombre: string;
  resumenCorto: string;
  descripcion: string;
  prioridades: PrioridadesRotacion;
}

export const OBJETIVOS_PRINCIPALES: DefinicionObjetivo[] = [
  {
    id: "equilibrado",
    nombre: "Equilibrado",
    resumenCorto: "Balance entre rendimiento, suelo y recursos",
    descripcion: "Equilibra producción estable, protección del suelo, control sanitario y uso eficiente del agua.",
    prioridades: { agua: 4, suelo: 4, plagas: 4, forraje: 3, ingreso: 4 },
  },
  {
    id: "suelo",
    nombre: "Mejorar el suelo",
    resumenCorto: "Rotación, fijación de nitrógeno y nutrientes",
    descripcion: "Prioriza leguminosas fijadoras de nitrógeno, cobertura vegetal y ruptura de ciclos de plagas.",
    prioridades: { agua: 2, suelo: 5, plagas: 5, forraje: 1, ingreso: 2 },
  },
  {
    id: "agua",
    nombre: "Ahorrar agua",
    resumenCorto: "Cultivos de bajo requerimiento hídrico",
    descripcion: "Selecciona especies tolerantes a déficit hídrico y ajusta la siembra a los meses de mayor humedad.",
    prioridades: { agua: 5, suelo: 3, plagas: 3, forraje: 2, ingreso: 2 },
  },
  {
    id: "ingreso",
    nombre: "Mayores ingresos",
    resumenCorto: "Alta rentabilidad y demanda comercial",
    descripcion: "Prioriza cultivos de mayor valor comercial y aprovechamiento productivo manteniendo reglas sanitarias.",
    prioridades: { agua: 2, suelo: 2, plagas: 3, forraje: 4, ingreso: 5 },
  },
];

export interface DefinicionEpoca {
  id: EpocaConsulta;
  nombre: string;
  detalle: string;
  mesReferencia: number;
  rangoMeses: number[];
}

export const EPOCAS_ANIO: DefinicionEpoca[] = [
  {
    id: "actual",
    nombre: "Época actual (próxima siembra)",
    detalle: "Cruza el objetivo con la ventana de siembra más cercana al mes en curso",
    mesReferencia: new Date().getMonth() + 1,
    rangoMeses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    id: "primera_epoca",
    nombre: "Primera época (Ene – Jun)",
    detalle: "Primer semestre del año y primera temporada de lluvias",
    mesReferencia: 3,
    rangoMeses: [1, 2, 3, 4, 5, 6],
  },
  {
    id: "segunda_epoca",
    nombre: "Segunda época (Jul – Dic)",
    detalle: "Segundo semestre del año y segunda temporada agrícola",
    mesReferencia: 9,
    rangoMeses: [7, 8, 9, 10, 11, 12],
  },
];

export const ETIQUETA_PRIORIDAD: Record<PrioridadRotacion, string> = {
  agua: "Ahorro de agua",
  suelo: "Salud del suelo",
  plagas: "Control sanitario",
  forraje: "Valor forrajero",
  ingreso: "Rentabilidad",
};

export const ETIQUETA_REGLA: Record<ReglaRotacion, string> = {
  no_sembrar_en_carretera: "Terreno libre de vías y carreteras",
  no_repetir_familia: "Sin repetir la misma familia botánica seguida",
  leguminosa_cada_dos_anios: "Incluye leguminosa que aporta nitrógeno",
  siembra_en_temporada: "Siembra dentro de la temporada climática",
  temperatura_apta: "Temperatura del ciclo adecuada para el cultivo",
  evitar_helada: "Protección frente a meses de helada",
  tolerancia_calor: "Tolerancia al calor de la época",
  agua_suficiente: "Requerimiento de agua cubierto por lluvia o riego",
  ciclo_cabe_en_ventana: "Duración del cultivo ajustada a la ventana",
  suelo_compatible: "Suelo compatible en pH y textura",
  cobertura_en_pendiente: "Protección del suelo en terreno con pendiente",
  aprovechar_baldio: "Aprovechamiento de meses tradicionalmente sin cultivo",
};

export const ETIQUETA_OPORTUNIDAD: Record<TipoOportunidad, string> = {
  baldio_cobertura: "Aprovechar meses sin cultivo con cobertura",
  temporada_vulnerable: "Protección en época climática sensible",
  romper_ciclo_plagas: "Corte del ciclo de plagas y enfermedades",
  menor_demanda_agua: "Reducción del consumo de agua",
  mejorar_infiltracion: "Mejora de estructura e infiltración del suelo",
  sumar_ingreso: "Oportunidad de ingreso adicional",
};

export const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export const NOMBRE_MES_CAPITAL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function nombreMes(mes: number): string {
  return NOMBRE_MES[mes - 1] ?? String(mes);
}

export function nombreMesCapital(mes: number): string {
  return NOMBRE_MES_CAPITAL[mes - 1] ?? String(mes);
}

export function mesCorto(mes: number): string {
  return MES_CORTO[mes - 1] ?? String(mes);
}

export function listaMeses(meses: number[]): string {
  return meses.length === 0 ? "ninguno" : meses.map(nombreMes).join(", ");
}

/** Compatibilidad con componentes previos si usan PRESETS_PRIORIDADES. */
export const PRESETS_PRIORIDADES = OBJETIVOS_PRINCIPALES.map((o) => ({
  id: o.id,
  nombre: o.nombre,
  valores: o.prioridades,
}));

export interface EntradaSitio {
  cultivoActual: string;
  secuenciaActual?: string[];
  tieneRiego: boolean;
  prioridades: PrioridadesRotacion;
  objetivo?: ObjetivoPrincipal;
  epoca?: EpocaConsulta;
  altitudM?: number;
}

export type FaseExplorar = "inactivo" | "terreno" | "clima" | "listo" | "no_apto" | "error";

export interface EstadoExplorar {
  fase: FaseExplorar;
  area: AreaSeleccionadaDto | null;
  perfil: PerfilTerrenoDto | null;
  comparacion: ComparacionRotacionesDto | null;
  error: string | null;
  codigoError: string | null;
  segundos: number;
}

export const FUENTES_TERRENO = [
  "OpenStreetMap (vías y edificaciones)",
  "MODIS (cobertura y vegetación)",
  "SRTM (altitud y pendiente)",
  "SoilGrids (propiedades del suelo)",
];
export const FUENTES_CLIMA = [
  "NASA POWER (serie climática de 30 años)",
  "Evapotranspiración y balance hídrico",
  "Temporadas de siembra y riesgos",
  "Motor de rotación por objetivo",
];

/** Ubicaciones de acceso rápido para probar el análisis sin pasos adicionales. */
export const UBICACIONES_RAPIDAS: { nombre: string; region: string; area: AreaSeleccionadaDto; cultivoSugerido: string }[] = [
  {
    nombre: "Altiplano Cundiboyacense",
    region: "Duitama rural, Boyacá (2.530 m)",
    area: { tipo: "punto", latitud: 5.785, longitud: -73.03 },
    cultivoSugerido: "papa",
  },
  {
    nombre: "Sabana Andina",
    region: "Paipa, Boyacá (2.525 m)",
    area: { tipo: "punto", latitud: 5.778, longitud: -73.115 },
    cultivoSugerido: "arveja",
  },
  {
    nombre: "Zona de Ladera Fría",
    region: "Santa Rosa de Viterbo (2.750 m)",
    area: { tipo: "punto", latitud: 5.875, longitud: -72.985 },
    cultivoSugerido: "cebada",
  },
];

/** Resultado cruzado entre el objetivo del agricultor y la época del año seleccionada. */
export interface RecomendacionAccionable {
  objetivo: DefinicionObjetivo;
  epoca: DefinicionEpoca;
  estrategia: EstrategiaRotacionDto;
  pasoRecomendado: PasoRotacionDto;
  pasosSecuencia: PasoRotacionDto[];
  queSembrar: string;
  cuandoSembrar: string;
  beneficioClave: string;
  razonEpoca: string;
  cuidadosClave: string[];
}

/**
 * Cruza el objetivo principal elegido con la época del año y las estrategias calculadas
 * para devolver la recomendación exacta, el paso de siembra ideal y la explicación clara.
 */
export function resolverRecomendacionPorObjetivoYEpoca(
  comparacion: ComparacionRotacionesDto,
  objetivoId: ObjetivoPrincipal,
  epocaId: EpocaConsulta,
): RecomendacionAccionable {
  const objetivo = OBJETIVOS_PRINCIPALES.find((o) => o.id === objetivoId) ?? OBJETIVOS_PRINCIPALES[0];
  const epoca = EPOCAS_ANIO.find((e) => e.id === epocaId) ?? EPOCAS_ANIO[0];

  const candidatas = comparacion.estrategias.filter((e) => e.id !== "A");
  const pool = candidatas.length > 0 ? candidatas : comparacion.estrategias;

  let estrategia: EstrategiaRotacionDto = pool[0];
  if (objetivoId === "suelo") {
    estrategia =
      pool.find((e) => e.enfoque === "suelo") ??
      [...pool].sort((a, b) => (b.puntajes.suelo * 0.6 + b.puntajes.plagas * 0.4) - (a.puntajes.suelo * 0.6 + a.puntajes.plagas * 0.4))[0];
  } else if (objetivoId === "agua") {
    estrategia =
      pool.find((e) => e.enfoque === "agua") ??
      [...pool].sort((a, b) => b.puntajes.agua - a.puntajes.agua)[0];
  } else if (objetivoId === "ingreso") {
    estrategia =
      [...pool].sort((a, b) => (b.puntajes.ingreso * 0.65 + b.puntajes.forraje * 0.35) - (a.puntajes.ingreso * 0.65 + a.puntajes.forraje * 0.35))[0];
  } else {
    estrategia =
      pool.find((e) => e.id === comparacion.estrategiaMejorPuntuada) ??
      [...pool].sort(
        (a, b) =>
          (b.puntajes.suelo + b.puntajes.agua + b.puntajes.plagas + b.puntajes.ingreso) -
          (a.puntajes.suelo + a.puntajes.agua + a.puntajes.plagas + a.puntajes.ingreso),
      )[0];
  }

  // Cruzar con la época del año seleccionada (buscando el paso con cultivo que coincida con la época)
  const pasosConCultivo = estrategia.secuencia.filter((p) => p.cultivoClave !== "barbecho");
  const basePasos = pasosConCultivo.length > 0 ? pasosConCultivo : estrategia.secuencia;

  let pasoRecomendado = basePasos[0];
  if (epocaId === "primera_epoca") {
    pasoRecomendado = basePasos.find((p) => p.mesSiembra >= 1 && p.mesSiembra <= 6) ?? basePasos[0];
  } else if (epocaId === "segunda_epoca") {
    pasoRecomendado = basePasos.find((p) => p.mesSiembra >= 7 && p.mesSiembra <= 12) ?? basePasos[basePasos.length > 1 ? 1 : 0];
  } else {
    const mesActual = epoca.mesReferencia;
    // Busca el paso cuya siembra sea en o justo después del mes actual, o que esté activo en el mes actual
    const proximo =
      basePasos.find((p) => p.mesSiembra >= mesActual && p.anio === 1) ??
      basePasos.find((p) => p.mesesCiclo.includes(mesActual)) ??
      basePasos[0];
    pasoRecomendado = proximo;
  }

  const esDescanso = pasoRecomendado.cultivoClave === "barbecho";
  const queSembrar = esDescanso ? "Descanso programado con cobertura vegetal" : pasoRecomendado.cultivoNombre;
  const duracionMeses = pasoRecomendado.mesesCiclo.length;
  const cuandoSembrar = `Siembra en ${nombreMes(pasoRecomendado.mesSiembra)} y cosecha en ${nombreMes(pasoRecomendado.mesCosecha)} (${duracionMeses} ${
    duracionMeses === 1 ? "mes" : "meses"
  })`;

  const razonesPorObjetivo: Record<ObjetivoPrincipal, string> = {
    equilibrado:
      estrategia.beneficios[0] ??
      `Mantiene un balance sólido (${Math.round(estrategia.puntajeTotal)}/100) entre salud del suelo, control de plagas y aprovechamiento del agua.`,
    suelo:
      `Mejora la fertilidad y estructura del suelo (${Math.round(estrategia.puntajes.suelo)}/100 en suelo) y corta el ciclo de plagas (${Math.round(
        estrategia.puntajes.plagas,
      )}/100 en sanidad) sin repetir familias botánicas.`,
    agua:
      `Optimiza el recurso hídrico (${Math.round(estrategia.puntajes.agua)}/100 en eficiencia de agua): el ciclo recibe aproximadamente ${Math.round(
        pasoRecomendado.lluviaCicloMm,
      )} mm de lluvia${pasoRecomendado.deficitAguaMm > 0 ? ` con déficit reducido de ${Math.round(pasoRecomendado.deficitAguaMm)} mm` : " cubriendo la demanda del cultivo"}.`,
    ingreso:
      `Prioriza rentabilidad comercial y aprovechamiento productivo (${Math.round(
        estrategia.puntajes.ingreso,
      )}/100 en ingreso) respetando la rotación sanitaria del lote.`,
  };

  const esMesLluvioso = comparacion.clima.mesesLluviosos.includes(pasoRecomendado.mesSiembra);
  const razonEpoca = `Para ${epoca.nombre.toLowerCase()}, iniciar en ${nombreMes(pasoRecomendado.mesSiembra)} aprovecha ${
    esMesLluvioso ? "el inicio de las lluvias de la temporada" : "la ventana térmica disponible"
  } con temperatura media de ${pasoRecomendado.tempMediaCicloC.toFixed(1)} °C y ${Math.round(
    pasoRecomendado.lluviaCicloMm,
  )} mm de lluvia acumulada durante el ciclo.`;

  const cuidadosClave: string[] = [];
  if (pasoRecomendado.requiereRiego) {
    cuidadosClave.push(`Requiere apoyo de riego suplementario (faltan aprox. ${Math.round(pasoRecomendado.deficitAguaMm)} mm frente a la lluvia del ciclo).`);
  } else {
    cuidadosClave.push(`La lluvia histórica del ciclo (${Math.round(pasoRecomendado.lluviaCicloMm)} mm) cubre la demanda hídrica en secano.`);
  }
  if (pasoRecomendado.riesgoHelada === "moderado" || pasoRecomendado.riesgoHelada === "alto") {
    cuidadosClave.push(`Vigilar descensos de temperatura en ${listaMeses(pasoRecomendado.mesesHeladaEnCiclo)}.`);
  } else if (pasoRecomendado.mesesHeladaEnCiclo.length === 0) {
    cuidadosClave.push("El ciclo evita los meses críticos de helada severa en esta ubicación.");
  }

  return {
    objetivo,
    epoca,
    estrategia,
    pasoRecomendado,
    pasosSecuencia: estrategia.secuencia,
    queSembrar,
    cuandoSembrar,
    beneficioClave: razonesPorObjetivo[objetivoId],
    razonEpoca,
    cuidadosClave,
  };
}
