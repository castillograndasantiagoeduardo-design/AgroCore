/**
 * Evaluación de las 7 reglas agronómicas sobre una secuencia de 4 semestres (servicio de dominio puro).
 * Siempre devuelve las 7, en el orden de REGLAS_ROTACION, con un detalle que nombra los semestres afectados.
 */
import { type EvaluacionReglaDto, REGLAS_ROTACION, type ReglaRotacion } from "@agrocore/contracts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import type { ContextoMotor, PasoEvaluado } from "./evaluar-paso.service.ts";

const etiqueta = (p: PasoEvaluado): string => "semestre " + p.paso.semestre + " (" + p.paso.cultivoNombre + ")";
const lista = (xs: string[]): string => xs.join(", ");

/** Índices i de los pares consecutivos (i → i+1) que repiten familia, sin contar la continuación de una pradera. */
export function transicionesFamiliaRepetida(cultivos: readonly Cultivo[], evaluados: readonly PasoEvaluado[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < cultivos.length - 1; i++) {
    if (cultivos[i].compartenFamilia(cultivos[i + 1]) && !evaluados[i + 1].paso.continuaPradera) indices.push(i);
  }
  return indices;
}

export function evaluarReglas(
  cultivos: readonly Cultivo[],
  evaluados: readonly PasoEvaluado[],
  ctx: ContextoMotor,
): EvaluacionReglaDto[] {
  const r = (regla: ReglaRotacion, cumple: boolean, detalle: string): EvaluacionReglaDto => ({ regla, cumple, detalle });
  const out = new Map<ReglaRotacion, EvaluacionReglaDto>();

  // no_repetir_familia
  const repetidas = transicionesFamiliaRepetida(cultivos, evaluados);
  out.set(
    "no_repetir_familia",
    repetidas.length === 0
      ? r("no_repetir_familia", true, "Ningún semestre repite la familia botánica del anterior.")
      : r(
        "no_repetir_familia",
        false,
        "Se repite la familia botánica en: " +
          lista(repetidas.map((i) =>
            "semestre " + (i + 1) + " (" + evaluados[i].paso.cultivoNombre + ") → semestre " + (i + 2) +
            " (" + evaluados[i + 1].paso.cultivoNombre + ")"
          )) + ".",
      ),
  );

  // leguminosa_cada_dos_anios
  const legum = evaluados.filter((_, i) => cultivos[i].fijaNitrogeno);
  out.set(
    "leguminosa_cada_dos_anios",
    legum.length > 0
      ? r("leguminosa_cada_dos_anios", true, "Hay una leguminosa que fija nitrógeno en: " + lista(legum.map(etiqueta)) + ".")
      : r("leguminosa_cada_dos_anios", false, "Ningún cultivo de los 4 semestres fija nitrógeno (no hay leguminosa)."),
  );

  // siembra_inicio_lluvias
  const sinLluvia = ctx.ventanas.filter((v) => !v.coincideConLluvias);
  out.set(
    "siembra_inicio_lluvias",
    sinLluvia.length === 0
      ? r("siembra_inicio_lluvias", true, "Las siembras de " + lista(ctx.ventanas.map((v) => v.nombreMes)) + " caen en meses lluviosos.")
      : r(
        "siembra_inicio_lluvias",
        false,
        "La siembra de " + lista(sinLluvia.map((v) => v.nombreMes + " (semestre " + v.semestreDelAnio + " de cada año)")) +
          " no coincide con meses lluviosos.",
      ),
  );

  // evitar_helada
  const altos = evaluados.filter((e) => e.paso.riesgoHelada === "alto");
  out.set(
    "evitar_helada",
    altos.length === 0
      ? r("evitar_helada", true, "Ningún cultivo de baja tolerancia tiene su ciclo en meses de helada.")
      : r(
        "evitar_helada",
        false,
        "Riesgo alto de helada en: " +
          lista(altos.map((e) => etiqueta(e) + " [" + e.paso.mesesHeladaEnCiclo.length + " mes(es) de helada en el ciclo]")) + ".",
      ),
  );

  // altitud_apta
  const noAptos = evaluados.filter((_, i) => cultivos[i].aptitudPorAltitud(ctx.altitudM) === "no_apta");
  out.set(
    "altitud_apta",
    noAptos.length === 0
      ? r("altitud_apta", true, "Todos los cultivos son aptos a " + ctx.altitudM + " m.")
      : r("altitud_apta", false, "No son aptos a " + ctx.altitudM + " m: " + lista(noAptos.map(etiqueta)) + "."),
  );

  // agua_suficiente
  const conDeficit = evaluados.filter((e) => e.paso.deficitAguaMm > 0);
  if (conDeficit.length === 0) {
    out.set("agua_suficiente", r("agua_suficiente", true, "La lluvia del ciclo cubre el agua mínima de todos los cultivos."));
  } else if (ctx.tieneRiego) {
    out.set(
      "agua_suficiente",
      r("agua_suficiente", true, "Falta agua de lluvia en " + lista(conDeficit.map(etiqueta)) + ", pero la finca tiene riego."),
    );
  } else {
    out.set(
      "agua_suficiente",
      r(
        "agua_suficiente",
        false,
        "Falta agua y la finca no tiene riego en: " +
          lista(conDeficit.map((e) => etiqueta(e) + " [faltan " + e.paso.deficitAguaMm + " mm]")) + ".",
      ),
    );
  }

  // ciclo_cabe_en_ventana
  const noCabe = evaluados.filter((e) => !e.cabeEnVentana);
  out.set(
    "ciclo_cabe_en_ventana",
    noCabe.length === 0
      ? r("ciclo_cabe_en_ventana", true, "Todos los ciclos terminan antes de la siguiente siembra.")
      : r("ciclo_cabe_en_ventana", false, "El ciclo no cabe antes de la siguiente siembra en: " + lista(noCabe.map(etiqueta)) + "."),
  );

  return REGLAS_ROTACION.map((regla) => out.get(regla)!);
}
