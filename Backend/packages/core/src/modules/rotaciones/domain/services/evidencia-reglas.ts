/**
 * Evidencia que respalda cada regla del motor de rotaciones. SOLO DATOS.
 *
 * Honestidad ante todo: `respaldo` dice qué tan firme es cada regla.
 *   - "documentada"       = una fuente reconocida la recomienda de forma explícita.
 *   - "practica_habitual" = es lo que se acostumbra o es razonable, pero no hay cifra universal que la fije.
 *                           Se presenta como práctica recomendada, NO como regla validada.
 *   - "calculada"         = no es una recomendación externa: sale de los datos del sitio (clima, NDVI, suelo,
 *                           relieve) cruzados con el catálogo de cultivos.
 */
import type { FuenteEvidencia, ReglaRotacion } from "@agrocore/contracts";
import { PROBABILIDAD_RIESGO_HELADA, UMBRAL_CALOR_C } from "../../../clima/domain/services/calendario-climatico.service.ts";
import { DIAS_CALOR_MES_CRITICO, FRACCION_DEFICIT } from "../../../clima/domain/services/resumen-climatico.service.ts";
import { TEMP_MINIMA_CRECIMIENTO_C } from "../../../clima/domain/services/temporadas-cultivo.service.ts";
import { DIAS_HELADA_EXPOSICION } from "./evaluar-paso.service.ts";
import { PENDIENTE_FUERTE_PCT } from "./reglas-rotacion.service.ts";

/** Fracción (0–1) escrita como porcentaje, tomada siempre de la constante que la define. */
const pct = (fraccion: number): string => Math.round(fraccion * 100) + " %";

export type RespaldoRegla = "documentada" | "practica_habitual" | "calculada";

export interface EvidenciaRegla {
  respaldo: RespaldoRegla;
  /** Una frase lista para mostrar en `evidencia` de la estrategia. */
  resumen: string;
  /** De dónde sale el dato (para la insignia de la evidencia). */
  fuente: FuenteEvidencia;
  fuentes: string[];
  /** Lo que NO se sabe de esta regla: va a `vaciosInformacion`. */
  vacios: string[];
}

const FAO_SAVE_AND_GROW = "FAO (2011), Save and Grow: rotación y diversificación de cultivos";
const SARE = "SARE (2007), Managing Cover Crops Profitably, 3.ª ed.";

export const EVIDENCIA_REGLAS: Record<ReglaRotacion, EvidenciaRegla> = {
  no_sembrar_en_carretera: {
    respaldo: "calculada",
    resumen: "Se descartó la parte del lote que cae sobre vías, edificaciones o agua según OpenStreetMap (distancia al eje de la vía " +
      "menor que medio ancho típico del tipo de vía).",
    fuente: "OpenStreetMap",
    fuentes: ["OpenStreetMap (Overpass API)"],
    vacios: ["OpenStreetMap puede no tener mapeados caminos rurales nuevos o trochas: verifica el lote en el terreno."],
  },
  no_repetir_familia: {
    respaldo: "documentada",
    resumen: "Rotar familias botánicas corta el ciclo de plagas y enfermedades del suelo que comparten (nematodos, hongos de raíz, " +
      "insectos específicos); la FAO y los servicios de extensión lo recomiendan de forma explícita.",
    fuente: "Regla",
    fuentes: [FAO_SAVE_AND_GROW, "ICA (2011), Manejo fitosanitario del cultivo de la papa (rotación sin solanáceas)"],
    vacios: [
      "Ninguna fuente fija un número universal de temporadas sin la misma familia: depende de la plaga (algunas, como el nematodo " +
        "quiste o la hernia de las crucíferas, persisten muchos años en el suelo).",
      "No se conoce el historial sanitario del lote.",
    ],
  },
  leguminosa_cada_dos_anios: {
    respaldo: "practica_habitual",
    resumen: "Incluir una leguminosa (o una cobertura con leguminosa) aporta nitrógeno por fijación biológica y es práctica habitual " +
      "en rotaciones de todo el mundo.",
    fuente: "Regla",
    fuentes: [FAO_SAVE_AND_GROW, SARE],
    vacios: [
      "'Una leguminosa cada dos años' es criterio del sistema, no una regla documentada universal.",
      "No hay mediciones locales de cuánto nitrógeno aporta cada leguminosa en este lote: no reduzcas la fertilización sin análisis de suelo.",
    ],
  },
  siembra_en_temporada: {
    respaldo: "calculada",
    resumen: "Las siembras se ubican en las temporadas de cultivo DERIVADAS del clima del sitio (temperatura media ≥ " + TEMP_MINIMA_CRECIMIENTO_C +
      " °C, sin helada dura y, en secano, lluvia ≥ " + pct(FRACCION_DEFICIT) + " de la evapotranspiración de referencia).",
    fuente: "NASA POWER",
    fuentes: ["Perfil climático del sitio (NASA POWER, normal climatológica)"],
    vacios: ["El calendario local de siembra puede diferir: confírmalo con el servicio de extensión o el agrónomo de la zona."],
  },
  temperatura_apta: {
    respaldo: "calculada",
    resumen: "Se compara la temperatura media de los meses de cada ciclo con el rango óptimo (TOPMN–TOPMX) y absoluto (TMIN–TMAX) del " +
      "cultivo en la base FAO ECOCROP.",
    fuente: "ECOCROP",
    fuentes: ["FAO ECOCROP (registro por EcoPortCode de cada cultivo)", "Perfil climático del sitio"],
    vacios: ["ECOCROP da rangos de referencia por especie, no por variedad ni por lugar: deben validarse con un agrónomo local."],
  },
  evitar_helada: {
    respaldo: "calculada",
    resumen: "Se cruzan los meses con probabilidad de helada ≥ " + pct(PROBABILIDAD_RIESGO_HELADA) + " y al menos " + DIAS_HELADA_EXPOSICION +
      " días de helada del perfil climático con los meses de cada ciclo y la tolerancia a helada del cultivo (derivada de su temperatura " +
      "letal en FAO ECOCROP; sin ese dato, el cultivo no se recomienda en meses con helada).",
    fuente: "NASA POWER",
    fuentes: ["Perfil climático del sitio", "Catálogo de cultivos"],
    vacios: ["El perfil usa promedios de una celda de decenas de km: en hondonadas las heladas pueden ser más frecuentes."],
  },
  tolerancia_calor: {
    respaldo: "calculada",
    resumen: "Se cruzan los meses con ≥ " + DIAS_CALOR_MES_CRITICO + " días de máxima ≥ " + UMBRAL_CALOR_C + " °C con los meses de cada ciclo y la " +
      "tolerancia al calor del cultivo.",
    fuente: "NASA POWER",
    fuentes: ["Perfil climático del sitio", "Catálogo de cultivos"],
    vacios: ["El daño por calor depende de la fase del cultivo (floración); el sistema evalúa el ciclo completo."],
  },
  agua_suficiente: {
    respaldo: "calculada",
    resumen: "Se suma la lluvia promedio de los meses del ciclo y se compara con el agua mínima del ciclo del cultivo (RMIN–ROPMN de FAO ECOCROP).",
    fuente: "NASA POWER",
    fuentes: ["Perfil climático del sitio", "Catálogo de cultivos"],
    vacios: ["No se conoce la capacidad del suelo de retener agua ni el caudal real del riego."],
  },
  ciclo_cabe_en_ventana: {
    respaldo: "calculada",
    resumen: "Se usa el ciclo medio del cultivo (GMIN–GMAX de FAO ECOCROP) para estimar si se cosecha antes de la siguiente siembra " +
      "(o si ocupa dos ventanas a propósito).",
    fuente: "ECOCROP",
    fuentes: ["FAO ECOCROP (registro por EcoPortCode de cada cultivo)"],
    vacios: ["El ciclo real depende de la variedad y de la temperatura (con frío, ciclos más largos)."],
  },
  suelo_compatible: {
    respaldo: "calculada",
    resumen: "Se compara el pH y la textura del suelo (ISRIC SoilGrids, 0–30 cm) con los rangos del cultivo.",
    fuente: "SoilGrids",
    fuentes: ["ISRIC SoilGrids v2.0", "Catálogo de cultivos"],
    vacios: ["SoilGrids es un modelo de 250 m, no un análisis del lote: confirma pH y textura con un análisis de laboratorio."],
  },
  cobertura_en_pendiente: {
    respaldo: "documentada",
    resumen: "Con pendiente mayor al " + PENDIENTE_FUERTE_PCT + " % el suelo desnudo se erosiona: se recomienda cobertura permanente, praderas o siembra en curvas de nivel.",
    fuente: "SRTM",
    fuentes: ["FAO (2000), Manual on integrated soil management and conservation practices", "NASA SRTM 30 m"],
    vacios: ["La pendiente se calcula con SRTM de 30 m en el centro del lote: puede variar dentro del área."],
  },
  aprovechar_baldio: {
    respaldo: "practica_habitual",
    resumen: "Los meses en que el NDVI muestra el lote sin vegetación son una oportunidad para una cobertura o un abono verde que " +
      "proteja el suelo y mejore la infiltración.",
    fuente: "MODIS",
    fuentes: ["NASA MODIS MOD13Q1 (NDVI 250 m)", SARE],
    vacios: ["El píxel MODIS mide 250 m: un lote pequeño puede verse mezclado con los vecinos."],
  },
};

/** Vacíos que aplican a cualquier estrategia: el sistema no tiene estos datos. */
export const VACIOS_GENERALES: readonly string[] = [
  "No hay análisis de suelo del lote (es la primera recomendación antes de rotar).",
  "El puntaje de ingreso usa el valor bruto de la producción por hectárea de FAOSTAT (solo de cultivos que se siembran en la zona): no incluye costos, precios locales ni el rendimiento del lote, y no es una proyección económica.",
  "No se conoce el historial de cultivos y plagas del lote más allá de lo que declara el agricultor.",
];

/** Riesgos que siempre conviene revisar con un agrónomo local, cualquiera sea la estrategia. */
export const RIESGOS_GENERALES: readonly string[] = [
  "Eliminar las plantas voluntarias del cultivo anterior durante la rotación: si quedan, la rotación pierde su efecto sanitario.",
  "Confirmar con un agrónomo local las plagas de suelo presentes antes de decidir cada cuánto vuelve un cultivo.",
];
