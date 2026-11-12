/**
 * Evidencia que respalda cada regla del motor de rotaciones. SOLO DATOS (los mantiene el agente
 * principal a partir del informe del investigador agronómico, 2026-11-12).
 *
 * Honestidad ante todo: `respaldo` dice qué tan firme es cada regla.
 *   - "documentada"       = una fuente oficial la recomienda de forma explícita.
 *   - "practica_habitual" = es lo que se acostumbra o es razonable, pero no encontramos cifra ni
 *                           estudio local que la fije. Debe presentarse como práctica recomendada,
 *                           NO como regla validada.
 *   - "calculada"         = no es una recomendación externa: sale de los datos de la finca
 *                           (clima calibrado, altitud) cruzados con el catálogo de cultivos.
 */
import type { ReglaRotacion } from "@duitamacrece/contracts";

export type RespaldoRegla = "documentada" | "practica_habitual" | "calculada";

export interface EvidenciaRegla {
  respaldo: RespaldoRegla;
  /** Una frase lista para mostrar en `evidencia` de la estrategia. */
  resumen: string;
  fuentes: string[];
  /** Lo que NO se sabe de esta regla: va a `vaciosInformacion`. */
  vacios: string[];
}

const ICA_2011 = "ICA (2011), Manejo fitosanitario del cultivo de la papa";

export const EVIDENCIA_REGLAS: Record<ReglaRotacion, EvidenciaRegla> = {
  no_repetir_familia: {
    respaldo: "documentada",
    resumen: "El ICA recomienda rotar la papa (sin otras solanáceas) y eliminar las toyas para manejar gusano blanco, " +
      "polilla guatemalteca, roña polvosa, Rhizoctonia y nematodo quiste; contra Rhizoctonia sugiere rotar con gramíneas " +
      "(pastos o cereales).",
    fuentes: [
      ICA_2011,
      "Agrosavia, revista Siembra 9(2), 2022: rotaciones papa–avena–arveja evaluadas en Tibaitatá (altiplano)",
    ],
    vacios: [
      "Ninguna fuente consultada fija cuántos semestres sin papa hacen falta contra gusano blanco, polilla guatemalteca o gota; " +
        "el gusano blanco tiene un ciclo largo y un solo semestre de descanso puede no bastar.",
      "No se conoce el historial sanitario del lote (roña polvosa, nematodo quiste, costra negra): si existe, puede requerir descansos más largos.",
    ],
  },
  leguminosa_cada_dos_anios: {
    respaldo: "practica_habitual",
    resumen: "Incluir una leguminosa después de la papa es práctica habitual en el altiplano (Fedepapa menciona arveja y pastos; " +
      "Agrosavia evaluó papa–avena–arveja) y avena + vicia fue de los abonos verdes más promisorios en Turmequé, Boyacá (2.300–2.860 m).",
    fuentes: [
      "Agrosavia, revista Siembra 9(2), 2022",
      "Viteri, Martínez y Bermúdez (UPTC), Selección de abonos verdes para los suelos de Turmequé (Boyacá), Agronomía Colombiana 26(2), 2008",
    ],
    vacios: [
      "No encontramos una regla documentada de frecuencia mínima de leguminosas ('una cada 2 años' es criterio del sistema).",
      "No hay mediciones locales de cuánto nitrógeno aportan arveja, haba, tarwi o vicia en el altiplano cundiboyacense: " +
        "no reduzcas la fertilización sin un análisis de suelo.",
    ],
  },
  siembra_inicio_lluvias: {
    respaldo: "practica_habitual",
    resumen: "Las siembras se ubican al inicio de las dos temporadas de lluvia que muestra el perfil climático de la finca.",
    fuentes: ["Perfil climático de la finca (NASA POWER calibrado con normales IDEAM 1991-2020)"],
    vacios: [
      "Corpoica (citado por la UPTC, 2015) recomienda para papa siembras de 'año grande' en enero–marzo y de 'mitaca' en junio–agosto: " +
        "el calendario local puede diferir de las ventanas que usa el sistema. Confírmalo con la UMATA.",
    ],
  },
  evitar_helada: {
    respaldo: "calculada",
    resumen: "Se cruzan los meses con probabilidad de helada ≥ 25 % del perfil climático con los meses que ocupa cada ciclo " +
      "y con la tolerancia a helada del cultivo en el catálogo.",
    fuentes: ["Perfil climático de la finca", "Catálogo de cultivos (valores de referencia FAO ECOCROP)"],
    vacios: [
      "El perfil corrige promedios mensuales: las heladas de noches puntuales, sobre todo en hondonadas, pueden estar subestimadas.",
    ],
  },
  altitud_apta: {
    respaldo: "calculada",
    resumen: "Se compara la altitud de la finca con el rango posible y óptimo de cada cultivo del catálogo.",
    fuentes: ["Catálogo de cultivos (valores de referencia FAO ECOCROP ajustados al altiplano)"],
    vacios: ["Los rangos de altitud del catálogo son de referencia y aún no los ha validado un agrónomo local."],
  },
  agua_suficiente: {
    respaldo: "calculada",
    resumen: "Se suma la lluvia promedio de los meses del ciclo y se compara con el agua mínima que necesita el cultivo.",
    fuentes: ["Perfil climático de la finca", "Catálogo de cultivos"],
    vacios: ["No se conoce el tipo de suelo ni su capacidad de retener agua, ni el caudal real del riego de la finca."],
  },
  ciclo_cabe_en_ventana: {
    respaldo: "calculada",
    resumen: "Se usa el ciclo medio del cultivo para estimar si se cosecha antes de la siguiente siembra.",
    fuentes: ["Catálogo de cultivos"],
    vacios: ["El ciclo real depende de la variedad y de la altitud (a mayor altura, ciclos más largos)."],
  },
};

/** Vacíos que aplican a cualquier estrategia: el sistema no tiene estos datos. */
export const VACIOS_GENERALES: readonly string[] = [
  "No hay análisis de suelo de la finca (Fedepapa señala no hacerlo antes de rotar como el error más común).",
  "No se usan precios ni costos: el puntaje de 'ingreso' es una referencia cualitativa, no una proyección económica.",
  "No se conoce la pendiente del lote (pendiente: calcularla con SRTM); en ladera pesa más la cobertura del suelo.",
];

/** Riesgos que siempre conviene revisar con un agrónomo, cualquiera sea la estrategia. */
export const RIESGOS_GENERALES: readonly string[] = [
  "Eliminar las toyas (papas voluntarias) durante los semestres sin papa: si quedan, la rotación pierde su efecto sanitario.",
  "Confirmar si hay nematodo quiste de la papa en el lote antes de decidir cada cuánto vuelve la papa.",
];
