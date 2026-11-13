/**
 * Textos explicativos de una estrategia (servicio de dominio puro).
 * Todo se genera con los datos calculados: no se inventan cifras ni se citan datos que no estén en el cálculo.
 */
import type { IdEstrategia, ReglaRotacion } from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";
import { type ContextoMotor, nombresDeMeses } from "./evaluar-paso.service.ts";
import { EVIDENCIA_REGLAS, RIESGOS_GENERALES, VACIOS_GENERALES } from "./evidencia-reglas.ts";
import type { SecuenciaEvaluada } from "./generar-estrategias.service.ts";

export const NOMBRES_ESTRATEGIA: Record<IdEstrategia, string> = {
  A: "Rotación actual",
  B: "Mejor para el suelo",
  C: "Mejor para lechería y forraje",
};

export interface DatosExplicacion {
  id: IdEstrategia;
  secuencia: SecuenciaEvaluada;
  ctx: ContextoMotor;
  altitudConocida: boolean;
  /** Cultivo principal de la finca (primero de la secuencia actual), si hay. */
  clavePrincipal: string | null;
  /** Solo para A: true si no se envió secuenciaActual y se asumió que la finca repite su cultivo actual. */
  secuenciaAsumida: boolean;
}

export interface TextosEstrategia {
  porQue: string;
  evidencia: string[];
  beneficios: string[];
  vaciosInformacion: string[];
  riesgos: string[];
}

const unicos = <T>(xs: T[]): T[] => [...new Set(xs)];
const sem = (n: number): string => "semestre " + n;

function nombresUnicos(s: SecuenciaEvaluada): string {
  return unicos(s.pasos.map((p) => p.cultivoNombre)).join(", ");
}

function reglasRelevantes(s: SecuenciaEvaluada): ReglaRotacion[] {
  const rel: ReglaRotacion[] = ["no_repetir_familia", "leguminosa_cada_dos_anios", "siembra_inicio_lluvias", "temperatura_apta"];
  if (s.pasos.some((p) => p.riesgoHelada !== "ninguno")) rel.push("evitar_helada");
  if (s.pasos.some((p) => p.deficitAguaMm > 0)) rel.push("agua_suficiente");
  if (s.evaluados.some((e) => !e.cabeEnVentana)) rel.push("ciclo_cabe_en_ventana");
  return rel;
}

function construirPorQue(d: DatosExplicacion): string {
  const s = d.secuencia;
  const cumplidas = s.reglas.filter((r) => r.cumple).length;
  const secuenciaTxt = s.pasos.map((p) => p.cultivoNombre).join(" → ");
  if (d.id === "A") {
    const origen = d.secuenciaAsumida
      ? "Se asumió que la finca repite su cultivo actual, porque no se conoce su historial."
      : "Es la secuencia que la finca siembra hoy.";
    return "Se evalúa lo que se siembra hoy, sin corregirlo: " + secuenciaTxt + ". " + origen + " Cumple " + cumplidas +
      " de las 7 reglas agronómicas.";
  }
  const legum = s.cultivos.filter((c) => c.fijaNitrogeno).length;
  if (d.id === "B") {
    return "Rota " + nombresUnicos(s) + " (" + secuenciaTxt + ") para cuidar el suelo: " + legum +
      " semestre(s) con leguminosa que fija nitrógeno y ninguna familia repetida en semestres seguidos. " +
      "Puntaje de suelo " + s.puntajes.suelo + " y de plagas " + s.puntajes.plagas + " sobre 100.";
  }
  return "Prioriza el forraje para lechería con " + nombresUnicos(s) + " (" + secuenciaTxt + "), sin dejar de rotar familias ni de incluir una leguminosa. " +
    "Puntaje de forraje " + s.puntajes.forraje + " sobre 100.";
}

function construirEvidencia(d: DatosExplicacion): string[] {
  const s = d.secuencia;
  const { ctx } = d;
  const out: string[] = [];

  out.push(
    "Altitud usada: " + ctx.altitudM + " m (" + (d.altitudConocida ? "registrada en la finca" : "tomada del perfil climático") + "). Aptitud: " +
      unicos(s.pasos.map((p) => p.cultivoNombre + " " + p.aptitudClima + " (" + p.tempMediaCicloC + " °C)")).join(", ") + ".",
  );
  for (const p of s.pasos) {
    let t = "Semestre " + p.semestre + " (" + p.cultivoNombre + "): " +
      (p.continuaPradera ? "continúa la pradera" : "siembra en " + NOMBRES_MES[p.mesSiembra - 1]) +
      ", meses del ciclo " + nombresDeMeses(p.mesesCiclo) + ", lluvia del ciclo " + p.lluviaCicloMm + " mm";
    if (p.deficitAguaMm > 0) t += " (faltan " + p.deficitAguaMm + " mm para el mínimo del cultivo)";
    t += "; helada: " + p.riesgoHelada + ".";
    out.push(t);
  }
  const helada = ctx.perfil.resumen.mesesRiesgoHelada;
  out.push("Meses con riesgo de helada según el perfil: " + (helada.length ? nombresDeMeses(helada) : "ninguno") + ".");
  out.push(
    "Clima: " + ctx.perfil.fuente + (ctx.perfil.calibracion ? "; calibrado con la estación " + ctx.perfil.calibracion.estacion : "; sin calibrar con estación IDEAM") +
      ". Lluvia anual " + ctx.perfil.resumen.lluviaAnualMm + " mm.",
  );
  for (const regla of reglasRelevantes(s)) {
    const ev = EVIDENCIA_REGLAS[regla];
    out.push(
      ev.respaldo === "practica_habitual"
        ? "Práctica recomendada (sin estudio local que fije la cifra): " + ev.resumen
        : ev.resumen,
    );
  }
  return out;
}

function construirBeneficios(d: DatosExplicacion): string[] {
  const s = d.secuencia;
  const out: string[] = [];
  const fijan = s.pasos.filter((_, i) => s.cultivos[i].fijaNitrogeno);
  if (fijan.length) out.push("Fija nitrógeno en " + fijan.map((p) => sem(p.semestre) + " (" + p.cultivoNombre + ")").join(", ") + ".");
  const cobertura = s.pasos.filter((_, i) => s.cultivos[i].coberturaSuelo === "alta");
  if (cobertura.length) out.push("Cobertura alta del suelo en " + cobertura.map((p) => sem(p.semestre) + " (" + p.cultivoNombre + ")").join(", ") + ".");
  const regla = (r: ReglaRotacion) => s.reglas.find((x) => x.regla === r)!;
  if (regla("no_repetir_familia").cumple && s.pasos.length > 1) {
    const papa = s.cultivos.some((c) => c.perteneceAFamilia("solanaceas"));
    out.push(papa ? "Se rompe la repetición de solanáceas (la familia de la papa) entre semestres seguidos." : "Ninguna familia botánica se repite en semestres seguidos.");
  }
  const forraje = s.pasos.filter((_, i) => s.cultivos[i].valorForrajero === "alto");
  if (forraje.length) out.push("Forraje de valor alto en " + forraje.map((p) => sem(p.semestre) + " (" + p.cultivoNombre + ")").join(", ") + ".");
  if (s.pasos.some((p) => p.continuaPradera)) out.push("La pradera perenne se mantiene sin resembrar en los semestres que continúa.");
  if (s.pasos.every((p) => p.riesgoHelada === "ninguno" || p.riesgoHelada === "tolerado")) {
    out.push("Ningún cultivo queda con riesgo alto ni moderado de helada.");
  }
  return out;
}

export function explicarEstrategia(d: DatosExplicacion): TextosEstrategia {
  const s = d.secuencia;

  const vacios = [...VACIOS_GENERALES];
  for (const regla of reglasRelevantes(s)) vacios.push(...EVIDENCIA_REGLAS[regla].vacios);

  const riesgos: string[] = [];
  for (const r of s.reglas) if (!r.cumple) riesgos.push("No cumple la regla " + r.regla + ": " + r.detalle);
  for (const p of s.pasos) {
    if (p.riesgoHelada === "moderado" || p.riesgoHelada === "alto") {
      riesgos.push(
        "Riesgo " + p.riesgoHelada + " de helada en " + sem(p.semestre) + " (" + p.cultivoNombre + "): el ciclo pasa por " +
          nombresDeMeses(p.mesesHeladaEnCiclo) + ".",
      );
    }
    if (p.deficitAguaMm > 0) {
      riesgos.push(
        "Déficit de agua de " + p.deficitAguaMm + " mm en " + sem(p.semestre) + " (" + p.cultivoNombre + ")" +
          (d.ctx.tieneRiego ? ": dependería del riego." : " y la finca no tiene riego."),
      );
    }
  }
  s.cultivos.forEach((c, i) => {
    if (s.pasos[i].aptitudClima === "posible") {
      riesgos.push(c.nombre + " solo es posible (no óptimo) con " + s.pasos[i].tempMediaCicloC + " °C de media en su ciclo (" + sem(i + 1) + "): el rendimiento puede ser menor.");
    }
  });
  if (d.id === "C" && d.clavePrincipal && !s.claves.includes(d.clavePrincipal)) {
    riesgos.push(
      "Esta estrategia no incluye el cultivo principal de la finca (" + d.clavePrincipal +
        "): implica un cambio de actividad productiva que hay que evaluar antes de decidir.",
    );
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
