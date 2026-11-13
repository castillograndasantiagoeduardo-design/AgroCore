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
    resumen: "Las siembras se ubican en las temporadas de cultivo DERIVADAS del clima del sitio (temperatura media ≥ 5 °C, sin helada " +
      "dura y, en secano, lluvia ≥ 50 % de la evapotranspiración de referencia).",
    fuente: "NASA POWER",
    fuentes: ["Perfil climático del sitio (NASA POWER, 30 años)"],
    vacios: ["El calendario local de siembra puede diferir: confírmalo con el servicio de extensión o el agrónomo de la zona."],
  },
  temperatura_apta: {
    respaldo: "calculada",
    resumen: "Se compara la temperatura media de los meses de cada ciclo con el rango óptimo y absoluto del cultivo (estilo FAO ECOCROP).",
    fuente: "ECOCROP",
    fuentes: ["Catálogo de cultivos (rangos de referencia FAO ECOCROP)", "Perfil climático del sitio"],
    vacios: ["Los rangos del catálogo son de referencia, no se verificaron en línea y deben validarse con un agrónomo local."],
  },
  evitar_helada: {
    respaldo: "calculada",
    resumen: "Se cruzan los meses con probabilidad de helada ≥ 25 % del perfil climático con los meses de cada ciclo y la tolerancia a " +
      "helada del cultivo.",
    fuente: "NASA POWER",
    fuentes: ["Perfil climático del sitio", "Catálogo de cultivos"],
    vacios: ["El perfil usa promedios de una celda de decenas de km: en hondonadas las heladas pueden ser más frecuentes."],
  },
  tolerancia_calor: {
    respaldo: "calculada",
    resumen: "Se cruzan los meses con ≥ 5 días de máxima ≥ 32 °C con los meses de cada ciclo y la tolerancia al calor del cultivo.",
    fuente: "NASA POWER",
    fuentes: ["Perfil climático del sitio", "Catálogo de cultivos"],
    vacios: ["El daño por calor depende de la fase del cultivo (floración); el sistema evalúa el ciclo completo."],
  },
  agua_suficiente: {
    respaldo: "calculada",
    resumen: "Se suma la lluvia promedio de los meses del ciclo y se compara con el agua mínima que necesita el cultivo.",
    fuente: "NASA POWER",
    fuentes: ["Perfil climático del sitio", "Catálogo de cultivos"],
    vacios: ["No se conoce la capacidad del suelo de retener agua ni el caudal real del riego."],
  },
  ciclo_cabe_en_ventana: {
    respaldo: "calculada",
    resumen: "Se usa el ciclo medio del cultivo para estimar si se cosecha antes de la siguiente siembra (o si ocupa dos ventanas a propósito).",
    fuente: "ECOCROP",
    fuentes: ["Catálogo de cultivos"],
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
    resumen: "Con pendiente mayor al 25 % el suelo desnudo se erosiona: se recomienda cobertura permanente, praderas o siembra en curvas de nivel.",
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
  "No se usan precios ni costos: el puntaje de 'ingreso' es una referencia cualitativa, no una proyección económica.",
  "No se conoce el historial de cultivos y plagas del lote más allá de lo que declara el agricultor.",
];

/** Riesgos que siempre conviene revisar con un agrónomo local, cualquiera sea la estrategia. */
export const RIESGOS_GENERALES: readonly string[] = [
  "Eliminar las plantas voluntarias del cultivo anterior durante la rotación: si quedan, la rotación pierde su efecto sanitario.",
  "Confirmar con un agrónomo local las plagas de suelo presentes antes de decidir cada cuánto vuelve un cultivo.",
];
