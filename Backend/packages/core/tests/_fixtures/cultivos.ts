/**
 * Fixture compartido: ficha de cultivo válida con valores de referencia (estilo ECOCROP).
 * Cada test cambia solo lo que le interesa.
 */
import { type CrearCultivoDatos, Cultivo } from "../../src/index.ts";

export function datosCultivo(cambios: Partial<CrearCultivoDatos> = {}): CrearCultivoDatos {
  return {
    clave: "papa",
    nombre: "Papa",
    nombreCientifico: "Solanum tuberosum",
    familias: ["solanaceas"],
    uso: "alimento",
    grupo: "tuberculo",
    perenne: false,
    cicloDias: [120, 180],
    ocupaVariasTemporadas: false,
    temperaturaOptimaC: [12, 18],
    temperaturaAbsolutaC: [6, 26],
    lluviaAnualOptimaMm: [600, 1000],
    aguaCicloMm: [500, 700],
    toleranciaHelada: "baja",
    toleranciaCalor: "baja",
    toleranciaSequia: "baja",
    necesidadAgua: "alta",
    phOptimo: [5.0, 6.5],
    texturas: ["arenosa", "franca"],
    profundidadRaiz: "superficial",
    fijaNitrogeno: false,
    coberturaSuelo: "media",
    valorForrajero: "bajo",
    plagasClave: ["tizón tardío"],
    notas: [],
    fuentes: ["Fuente de prueba"],
    confianza: "media",
    ...cambios,
  };
}

export function cultivoDePrueba(cambios: Partial<CrearCultivoDatos> = {}): Cultivo {
  const r = Cultivo.crear(datosCultivo(cambios));
  if (!r.ok) throw new Error("Datos de prueba inválidos: " + r.error.message);
  return r.value;
}
