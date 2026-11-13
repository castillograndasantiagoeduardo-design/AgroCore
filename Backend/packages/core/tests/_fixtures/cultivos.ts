/**
 * Fixture compartido: ficha de cultivo válida con valores de referencia (estilo FAO ECOCROP).
 * Cada test cambia solo lo que le interesa. La ficha trae todos sus campos con fuente (`camposSinFuente` vacío).
 */
import { type CrearCultivoDatos, Cultivo } from "../../src/index.ts";
// Solo DATOS del catálogo generado desde FAO ECOCROP + FAOSTAT (no se importa lógica de database).
import { CATALOGO_CULTIVOS } from "../../../database/src/catalogos/catalogo-cultivos.datos.ts";

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
    notas: [],
    fuentes: ["Fuente de prueba"],
    ecocrop: { codigos: [1], url: "https://ecocrop.apps.fao.org (prueba)" },
    fuentesValores: [],
    camposSinFuente: [],
    valorProduccionHa: { valor: null, unidad: "I$/ha", fuente: "FAOSTAT", tipo: "referencia", nota: "Sin datos (prueba)" },
    ...cambios,
  };
}

export function cultivoDePrueba(cambios: Partial<CrearCultivoDatos> = {}): Cultivo {
  const r = Cultivo.crear(datosCultivo(cambios));
  if (!r.ok) throw new Error("Datos de prueba inválidos: " + r.error.message);
  return r.value;
}

/** Los cultivos del catálogo REAL (generado desde FAO ECOCROP + FAOSTAT), construidos con la entidad. */
export function cultivosDelCatalogoReal(): Cultivo[] {
  return CATALOGO_CULTIVOS.map((d) => {
    const r = Cultivo.crear(d);
    if (!r.ok) throw new Error("Catálogo real inválido: " + r.error.message);
    return r.value;
  });
}
