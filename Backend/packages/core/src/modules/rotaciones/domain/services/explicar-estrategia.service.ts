/**
 * Textos explicativos de una estrategia (servicio de dominio puro).
 * Todo se genera con los datos calculados: no se inventan cifras ni se citan datos que no estén en el cálculo.
 * Cada evidencia lleva la FUENTE del dato (NASA POWER, IDEAM, MODIS, SoilGrids, SRTM, OpenStreetMap, ECOCROP,
 * Regla o Agricultor).
 */
import type { EvidenciaDto, IdEstrategia, ReglaRotacion } from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";
import { type ContextoMotor, nombresDeMeses } from "./evaluar-paso.service.ts";
import { EVIDENCIA_REGLAS, RIESGOS_GENERALES, VACIOS_GENERALES } from "./evidencia-reglas.ts";
import type { SecuenciaEvaluada } from "./generar-estrategias.service.ts";
import { pasosSembrados, PENDIENTE_FUERTE_PCT } from "./reglas-rotacion.service.ts";

export const NOMBRES_ESTRATEGIA: Record<IdEstrategia, string> = {
  A: "Rotación actual",
  B: "Mejor para el suelo",
  C: "Mejor para forraje e ingreso",
  D: "Menor demanda de agua",
};

export interface DatosExplicacion {
  id: IdEstrategia;
  secuencia: SecuenciaEvaluada;
  ctx: ContextoMotor;
  /** Cultivo principal del lote (primero de la secuencia actual). */
  clavePrincipal: string;
  /** Solo para A: true si no se envió secuenciaActual y se asumió que el lote repite su cultivo actual. */
  secuenciaAsumida: boolean;
}

export interface TextosEstrategia {
  porQue: string;
  evidencia: EvidenciaDto[];
  beneficios: string[];
  vaciosInformacion: string[];
  riesgos: string[];
}

const unicos = <T>(xs: T[]): T[] => [...new Set(xs)];
const paso = (n: number): string => "paso " + n;

function secuenciaTexto(s: SecuenciaEvaluada): string {
  return s.pasos.map((p) => (p.continua ? "(sigue " + p.cultivoNombre.toLowerCase() + ")" : p.cultivoNombre)).join(" → ");
}

function nombresUnicos(s: SecuenciaEvaluada): string {
  return unicos(pasosSembrados(s.evaluados).map((e) => e.paso.cultivoNombre)).join(", ");
}

function reglasRelevantes(s: SecuenciaEvaluada, ctx: ContextoMotor): ReglaRotacion[] {
  const rel: ReglaRotacion[] = ["no_repetir_familia", "leguminosa_cada_dos_anios", "siembra_en_temporada", "temperatura_apta"];
  if (s.pasos.some((p) => p.riesgoHelada !== "ninguno")) rel.push("evitar_helada");
  if (s.pasos.some((p) => p.riesgoCalor !== "ninguno")) rel.push("tolerancia_calor");
  if (s.pasos.some((p) => p.deficitAguaMm > 0)) rel.push("agua_suficiente");
  if (s.evaluados.some((e) => !e.cabe || e.necesitaSiguiente)) rel.push("ciclo_cabe_en_ventana");
  if (ctx.suelo.ph !== null || ctx.suelo.textura !== null) rel.push("suelo_compatible");
  if (ctx.pendientePct !== null) rel.push("cobertura_en_pendiente");
  if (ctx.mesesBaldios.length > 0) rel.push("aprovechar_baldio");
  if (ctx.excluidoPct > 0) rel.push("no_sembrar_en_carretera");
  return rel;
}

function construirPorQue(d: DatosExplicacion): string {
  const s = d.secuencia;
  const cumplidas = s.reglas.filter((r) => r.cumple).length;
  const total = s.reglas.length;
  if (d.id === "A") {
    const origen = d.secuenciaAsumida
      ? "Se asumió que el lote repite su cultivo actual, porque no se conoce su historial."
      : "Es la secuencia que el agricultor declaró.";
    return "Se evalúa lo que se siembra hoy, sin corregirlo: " + secuenciaTexto(s) + ". " + origen + " Cumple " + cumplidas + " de las " +
      total + " reglas agronómicas.";
  }
  const legum = pasosSembrados(s.evaluados).filter((e) => e.cultivo!.fijaNitrogeno).length;
  if (d.id === "B") {
    return "Rota " + nombresUnicos(s) + " (" + secuenciaTexto(s) + ") para cuidar el suelo: " + legum +
      " siembra(s) con leguminosa que fija nitrógeno, sin repetir familia y con la mejor cobertura posible. Puntaje de suelo " +
      s.puntajes.suelo + " y de plagas " + s.puntajes.plagas + " sobre 100. Cumple " + cumplidas + " de " + total + " reglas.";
  }
  if (d.id === "C") {
    return "Busca más biomasa e ingreso con " + nombresUnicos(s) + " (" + secuenciaTexto(s) + "), sin dejar de rotar familias ni de incluir " +
      "una leguminosa. Puntaje de forraje " + s.puntajes.forraje + " e ingreso " + s.puntajes.ingreso + " sobre 100.";
  }
  return "Reduce la demanda de agua con " + nombresUnicos(s) + " (" + secuenciaTexto(s) + "): cultivos de menor necesidad de agua o " +
    "tolerantes a la sequía en los meses de déficit. Puntaje de agua " + s.puntajes.agua + " sobre 100.";
}

function construirEvidencia(d: DatosExplicacion): EvidenciaDto[] {
  const s = d.secuencia;
  const { ctx } = d;
  const p = ctx.perfil;
  const out: EvidenciaDto[] = [];

  out.push({
    texto: "Clima del sitio (30 años): lluvia " + p.resumen.lluviaAnualMm + " mm/año, ET0 " + p.resumen.etoAnualMm + " mm/año, régimen " +
      p.resumen.regimenLluvias + ", clasificación " + p.resumen.clasificacionClimatica + ".",
    fuente: "NASA POWER",
  });
  if (p.calibracion) {
    out.push({
      texto: "Calibrado con la estación " + p.calibracion.estacion + " (" + p.calibracion.distanciaKm + " km, normales " + p.calibracion.periodo + ").",
      fuente: "IDEAM",
    });
  }
  out.push({ texto: "Ventanas del año: " + ctx.ventanas.map((v) => v.nombre).join(" · ") + ".", fuente: "NASA POWER" });

  for (const e of s.evaluados) {
    const q = e.paso;
    let t = "Paso " + q.orden + " (" + q.cultivoNombre + (q.continua ? ", continúa" : "") + "): " +
      (q.continua ? "" : "siembra en " + NOMBRES_MES[q.mesSiembra - 1] + ", ") + "meses " + nombresDeMeses(q.mesesCiclo) + ", T media " +
      q.tempMediaCicloC + " °C" + (q.aptitudClima ? " (" + q.aptitudClima + ")" : "") + ", lluvia " + q.lluviaCicloMm + " mm";
    if (q.deficitAguaMm > 0) t += " (faltan " + q.deficitAguaMm + " mm)";
    if (q.riesgoHelada !== "ninguno") t += "; helada " + q.riesgoHelada;
    if (q.riesgoCalor !== "ninguno") t += "; calor " + q.riesgoCalor;
    out.push({ texto: t + ".", fuente: "NASA POWER" });
  }

  for (const e of unicos(pasosSembrados(s.evaluados).map((x) => x.cultivo!))) {
    out.push({
      texto: e.nombre + ": T óptima " + e.temperaturaOptimaC.min + "–" + e.temperaturaOptimaC.max + " °C, absoluta " + e.temperaturaAbsolutaC.min +
        "–" + e.temperaturaAbsolutaC.max + " °C, agua del ciclo ≥ " + e.aguaCicloMm.min + " mm, helada " + e.toleranciaHelada + ", calor " +
        e.toleranciaCalor + " (ficha de referencia, confianza " + e.confianza + ").",
      fuente: "ECOCROP",
    });
  }

  if (ctx.suelo.ph !== null || ctx.suelo.textura !== null) {
    out.push({ texto: "Suelo 0–30 cm: pH " + (ctx.suelo.ph ?? "sin dato") + ", textura " + (ctx.suelo.textura ?? "sin dato") + ".", fuente: "SoilGrids" });
  }
  if (ctx.pendientePct !== null) {
    out.push({ texto: "Pendiente del lote: " + ctx.pendientePct + " % (límite para exigir cobertura: " + PENDIENTE_FUERTE_PCT + " %).", fuente: "SRTM" });
  }
  if (ctx.mesesBaldios.length > 0) {
    out.push({ texto: "Meses en que el lote suele estar baldío (NDVI): " + nombresDeMeses(ctx.mesesBaldios) + ".", fuente: "MODIS" });
  }
  if (ctx.excluidoPct > 0) {
    out.push({ texto: "Se excluyó el " + ctx.excluidoPct + " % del área por vías, edificaciones o agua.", fuente: "OpenStreetMap" });
  }
  if (d.id === "A") {
    out.push({
      texto: d.secuenciaAsumida ? "Cultivo actual declarado: " + d.clavePrincipal + " (se asume que se repite)." : "Secuencia declarada por el agricultor.",
      fuente: "Agricultor",
    });
  }
  for (const regla of reglasRelevantes(s, ctx)) {
    const ev = EVIDENCIA_REGLAS[regla];
    out.push({
      texto: ev.respaldo === "practica_habitual" ? "Práctica recomendada (sin cifra universal que la fije): " + ev.resumen : ev.resumen,
      fuente: "Regla",
    });
  }
  return out;
}

function construirBeneficios(d: DatosExplicacion): string[] {
  const s = d.secuencia;
  const out: string[] = [];
  const sembrados = pasosSembrados(s.evaluados);
  const fijan = sembrados.filter((e) => e.cultivo!.fijaNitrogeno);
  if (fijan.length) out.push("Fija nitrógeno en " + fijan.map((e) => paso(e.paso.orden) + " (" + e.paso.cultivoNombre + ")").join(", ") + ".");
  const cobertura = s.evaluados.filter((e) => e.cultivo?.coberturaSuelo === "alta");
  if (cobertura.length) out.push("Cobertura alta del suelo en " + cobertura.map((e) => paso(e.paso.orden) + " (" + e.paso.cultivoNombre + ")").join(", ") + ".");
  const profundas = unicos(sembrados.filter((e) => e.cultivo!.profundidadRaiz === "profunda").map((e) => e.paso.cultivoNombre));
  if (profundas.length) out.push("Raíces profundas que mejoran la infiltración: " + profundas.join(", ") + ".");
  const regla = (r: ReglaRotacion) => s.reglas.find((x) => x.regla === r)!;
  if (regla("no_repetir_familia").cumple && sembrados.length > 1) out.push("Ninguna familia botánica se repite seguida: se cortan ciclos de plagas del suelo.");
  const forraje = s.evaluados.filter((e) => e.cultivo?.valorForrajero === "alto");
  if (forraje.length) out.push("Forraje de valor alto en " + unicos(forraje.map((e) => e.paso.cultivoNombre)).join(", ") + ".");
  if (s.pasos.some((p) => p.continua)) out.push("Los cultivos de ciclo largo o perennes se mantienen sin resembrar.");
  if (s.pasos.filter((p) => p.cultivoClave !== "barbecho").every((p) => p.riesgoHelada !== "alto" && p.riesgoHelada !== "moderado" && p.riesgoCalor !== "alto")) {
    out.push("Ningún cultivo queda con riesgo alto ni moderado de helada, ni alto de calor.");
  }
  if (regla("aprovechar_baldio").cumple && d.ctx.mesesBaldios.length > 0) out.push("Aprovecha los meses en que el lote suele quedar baldío.");
  if (s.pasos.every((p) => p.deficitAguaMm === 0)) out.push("La lluvia del ciclo alcanza para todos los cultivos.");
  if (d.id === "A" && out.length === 0) out.push("Mantiene el cultivo que el agricultor ya conoce: sin costos de cambio ni aprendizaje.");
  if (out.length === 0) out.push("Cumple las reglas duras de clima, ciclo y agua del sitio.");
  return out;
}

export function explicarEstrategia(d: DatosExplicacion): TextosEstrategia {
  const s = d.secuencia;

  const vacios = [...VACIOS_GENERALES];
  if (d.id === "A" && d.secuenciaAsumida) {
    vacios.unshift("Se ASUMIÓ que el lote repite su cultivo actual (" + d.clavePrincipal + ") en todas las temporadas porque no se conoce su historial.");
  }
  for (const regla of reglasRelevantes(s, d.ctx)) vacios.push(...EVIDENCIA_REGLAS[regla].vacios);

  const riesgos: string[] = [];
  for (const r of s.reglas) if (!r.cumple) riesgos.push("No cumple " + r.regla + ": " + r.detalle);
  for (const q of s.pasos) {
    if (q.riesgoHelada === "moderado" || q.riesgoHelada === "alto") {
      riesgos.push("Helada (" + q.riesgoHelada + ") en " + paso(q.orden) + " (" + q.cultivoNombre + "): el ciclo pasa por " + nombresDeMeses(q.mesesHeladaEnCiclo) + ".");
    }
    if (q.riesgoCalor === "moderado" || q.riesgoCalor === "alto") {
      riesgos.push("Calor (" + q.riesgoCalor + ") en " + paso(q.orden) + " (" + q.cultivoNombre + "): el ciclo pasa por " + nombresDeMeses(q.mesesCalorEnCiclo) + ".");
    }
    if (q.deficitAguaMm > 0) {
      riesgos.push("Déficit de agua de " + q.deficitAguaMm + " mm en " + paso(q.orden) + " (" + q.cultivoNombre + ")" + (d.ctx.tieneRiego ? ": dependería del riego." : " y no hay riego."));
    }
    if (q.aptitudClima === "posible") {
      riesgos.push(q.cultivoNombre + " solo es posible (no óptimo) con " + q.tempMediaCicloC + " °C de media en " + paso(q.orden) + ": rendimiento menor.");
    }
  }
  const confianzaBaja = unicos(pasosSembrados(s.evaluados).filter((e) => e.cultivo!.confianza === "baja").map((e) => e.paso.cultivoNombre));
  if (confianzaBaja.length) riesgos.push("Los datos de referencia de " + confianzaBaja.join(", ") + " tienen confianza baja: valídalos con un agrónomo.");
  if (d.id !== "A" && !s.claves.includes(d.clavePrincipal)) {
    riesgos.push("No incluye el cultivo principal del lote (" + d.clavePrincipal + "): implica un cambio de actividad que hay que evaluar antes de decidir.");
  }
  riesgos.push(...RIESGOS_GENERALES);

  return {
    porQue: construirPorQue(d),
    evidencia: construirEvidencia(d),
    beneficios: construirBeneficios(d),
    vaciosInformacion: unicos(vacios),
    riesgos: unicos(riesgos),
  };
}
