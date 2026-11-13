/**
 * Evaluación de las 12 reglas agronómicas sobre una secuencia de 2 años (servicio de dominio puro).
 * Siempre devuelve las 12, en el orden de REGLAS_ROTACION, con un detalle que nombra los pasos afectados.
 */
import { type EvaluacionReglaDto, REGLAS_ROTACION, type ReglaRotacion } from "@agrocore/contracts";
import { type ContextoMotor, nombresDeMeses, type PasoEvaluado } from "./evaluar-paso.service.ts";
import { ANIOS_ROTACION } from "./ventanas-rotacion.service.ts";

/** Pendiente a partir de la cual se exige cobertura permanente o curvas de nivel (%). */
export const PENDIENTE_FUERTE_PCT = 25;

const etiqueta = (e: PasoEvaluado): string => "paso " + e.paso.orden + " (" + e.paso.cultivoNombre + ")";
const lista = (xs: string[]): string => xs.join(", ");

/** Pasos con cultivo (sin barbecho) que se SIEMBRAN (no continuaciones). */
export function pasosSembrados(evaluados: readonly PasoEvaluado[]): PasoEvaluado[] {
  return evaluados.filter((e) => e.cultivo !== null && !e.paso.continua);
}

/** Pares (anterior → siguiente) de cultivos sembrados seguidos que repiten familia (el barbecho no rompe la cadena). */
export function transicionesFamiliaRepetida(evaluados: readonly PasoEvaluado[]): [PasoEvaluado, PasoEvaluado][] {
  const sembrados = pasosSembrados(evaluados);
  const pares: [PasoEvaluado, PasoEvaluado][] = [];
  for (let i = 0; i < sembrados.length - 1; i++) {
    if (sembrados[i].cultivo!.compartenFamilia(sembrados[i + 1].cultivo!)) pares.push([sembrados[i], sembrados[i + 1]]);
  }
  return pares;
}

/** true si el pH o la textura del suelo no encajan con el cultivo sembrado (solo con datos de suelo y con fuente). */
export function pasoSueloIncompatible(e: PasoEvaluado, ctx: ContextoMotor): boolean {
  if (e.cultivo === null) return false;
  const { ph, textura } = ctx.suelo;
  return e.cultivo.phCompatible(ph) === false || e.cultivo.texturaCompatible(textura) === false;
}

export function evaluarReglas(evaluados: readonly PasoEvaluado[], ctx: ContextoMotor): EvaluacionReglaDto[] {
  const r = (regla: ReglaRotacion, cumple: boolean, detalle: string): EvaluacionReglaDto => ({ regla, cumple, detalle });
  const out = new Map<ReglaRotacion, EvaluacionReglaDto>();
  const conCultivo = evaluados.filter((e) => e.cultivo !== null);

  out.set(
    "no_sembrar_en_carretera",
    r(
      "no_sembrar_en_carretera",
      true,
      ctx.excluidoPct > 0
        ? "Se excluyó el " + ctx.excluidoPct + " % del área (vías, edificaciones o agua); la rotación aplica al resto."
        : "El sitio no cae sobre vías, edificaciones ni agua según OpenStreetMap.",
    ),
  );

  const repetidas = transicionesFamiliaRepetida(evaluados);
  out.set(
    "no_repetir_familia",
    repetidas.length === 0
      ? r("no_repetir_familia", true, "Ningún cultivo repite la familia botánica del cultivo anterior.")
      : r("no_repetir_familia", false, "Se repite la familia en: " + lista(repetidas.map(([a, b]) => etiqueta(a) + " → " + etiqueta(b))) + "."),
  );

  const legum = conCultivo.filter((e) => e.cultivo!.fijaNitrogeno);
  out.set(
    "leguminosa_cada_dos_anios",
    legum.length > 0
      ? r("leguminosa_cada_dos_anios", true, "Hay una leguminosa que fija nitrógeno en: " + lista(legum.map(etiqueta)) + ".")
      : r("leguminosa_cada_dos_anios", false, "Ningún cultivo de los " + ANIOS_ROTACION + " años fija nitrógeno (no hay leguminosa)."),
  );

  const fueraTemporada = pasosSembrados(evaluados).filter((e) => e.paso.tipoVentana === "intervalo" && !e.cultivo!.esCobertura);
  out.set(
    "siembra_en_temporada",
    fueraTemporada.length === 0
      ? r("siembra_en_temporada", true, "Los cultivos principales se siembran en las temporadas de cultivo del sitio.")
      : r("siembra_en_temporada", false, "Se siembran fuera de temporada (en el intervalo): " + lista(fueraTemporada.map(etiqueta)) + "."),
  );

  // Las continuaciones (pradera en reposo invernal, cultivo largo) no son siembras: se evalúa el ciclo al sembrarlo.
  const noAptos = conCultivo.filter((e) => !e.paso.continua && e.paso.aptitudClima === "no_apta");
  out.set(
    "temperatura_apta",
    noAptos.length === 0
      ? r("temperatura_apta", true, "La temperatura media de cada ciclo está dentro del rango de su cultivo.")
      : r("temperatura_apta", false, "Temperatura del ciclo fuera del rango del cultivo en: " + lista(noAptos.map((e) => etiqueta(e) + " [" + e.paso.tempMediaCicloC + " °C]")) + "."),
  );

  const helada = conCultivo.filter((e) => e.paso.riesgoHelada === "alto");
  out.set(
    "evitar_helada",
    helada.length === 0
      ? r("evitar_helada", true, "Ningún cultivo sensible a la helada tiene su ciclo en meses de helada.")
      : r("evitar_helada", false, "Riesgo alto de helada en: " + lista(helada.map((e) => etiqueta(e) + " [" + nombresDeMeses(e.paso.mesesHeladaEnCiclo) + "]")) + "."),
  );

  const calor = conCultivo.filter((e) => e.paso.riesgoCalor === "alto");
  out.set(
    "tolerancia_calor",
    calor.length === 0
      ? r("tolerancia_calor", true, "Ningún cultivo sensible al calor tiene su ciclo en meses de calor.")
      : r("tolerancia_calor", false, "Riesgo alto de calor en: " + lista(calor.map((e) => etiqueta(e) + " [" + nombresDeMeses(e.paso.mesesCalorEnCiclo) + "]")) + "."),
  );

  const conDeficit = conCultivo.filter((e) => e.paso.deficitAguaMm > 0);
  if (conDeficit.length === 0) {
    out.set("agua_suficiente", r("agua_suficiente", true, "La lluvia del ciclo cubre el agua mínima de todos los cultivos."));
  } else if (ctx.tieneRiego) {
    out.set("agua_suficiente", r("agua_suficiente", true, "Falta lluvia en " + lista(conDeficit.map(etiqueta)) + ", pero el lote tiene riego."));
  } else {
    out.set(
      "agua_suficiente",
      r("agua_suficiente", false, "Falta agua y no hay riego en: " + lista(conDeficit.map((e) => etiqueta(e) + " [faltan " + e.paso.deficitAguaMm + " mm]")) + "."),
    );
  }

  const noCabe = evaluados.filter((e) => !e.cabe);
  out.set(
    "ciclo_cabe_en_ventana",
    noCabe.length === 0
      ? r("ciclo_cabe_en_ventana", true, "Todos los ciclos terminan antes de la siguiente siembra (o continúan a propósito en la ventana siguiente).")
      : r("ciclo_cabe_en_ventana", false, "El ciclo no cabe antes de la siguiente siembra en: " + lista(noCabe.map(etiqueta)) + "."),
  );

  const { ph, textura } = ctx.suelo;
  if (ph === null && textura === null) {
    out.set("suelo_compatible", r("suelo_compatible", true, "Sin datos de suelo (SoilGrids): no se pudo verificar pH ni textura."));
  } else {
    const malos = pasosSembrados(evaluados).filter((e) => pasoSueloIncompatible(e, ctx));
    out.set(
      "suelo_compatible",
      malos.length === 0
        ? r("suelo_compatible", true, "pH " + (ph ?? "?") + " y textura " + (textura ?? "?") + " compatibles con todos los cultivos.")
        : r("suelo_compatible", false, "pH " + (ph ?? "?") + " o textura " + (textura ?? "?") + " fuera de lo que tolera: " + lista(malos.map(etiqueta)) + "."),
    );
  }

  if (ctx.pendientePct === null) {
    out.set("cobertura_en_pendiente", r("cobertura_en_pendiente", true, "Sin dato de pendiente (SRTM): no se evaluó el riesgo de erosión."));
  } else if (ctx.pendientePct <= PENDIENTE_FUERTE_PCT) {
    out.set("cobertura_en_pendiente", r("cobertura_en_pendiente", true, "Pendiente de " + ctx.pendientePct + " % (≤ " + PENDIENTE_FUERTE_PCT + " %): no exige cobertura permanente."));
  } else {
    const protegidos = evaluados.filter((e) => e.cultivo !== null && (e.cultivo.perenne || e.cultivo.coberturaConocida() === "alta")).length;
    out.set(
      "cobertura_en_pendiente",
      protegidos * 2 >= evaluados.length
        ? r("cobertura_en_pendiente", true, "Pendiente de " + ctx.pendientePct + " %: " + protegidos + " de " + evaluados.length + " pasos con cobertura alta o perenne.")
        : r("cobertura_en_pendiente", false, "Pendiente de " + ctx.pendientePct + " % con poca cobertura (" + protegidos + " de " + evaluados.length + " pasos): sembrar en curvas de nivel o con cobertura permanente."),
    );
  }

  if (ctx.mesesBaldios.length === 0) {
    out.set("aprovechar_baldio", r("aprovechar_baldio", true, "El NDVI no muestra meses típicamente baldíos en este lote."));
  } else {
    const cubiertos = new Set(conCultivo.filter((e) => e.paso.anio === 1).flatMap((e) => e.paso.mesesCiclo));
    const aprovechados = ctx.mesesBaldios.filter((m) => cubiertos.has(m));
    out.set(
      "aprovechar_baldio",
      aprovechados.length * 2 >= ctx.mesesBaldios.length
        ? r("aprovechar_baldio", true, "Cubre " + aprovechados.length + " de los " + ctx.mesesBaldios.length + " meses que el lote suele estar baldío (" + nombresDeMeses(ctx.mesesBaldios) + ").")
        : r("aprovechar_baldio", false, "Deja sin cubrir los meses baldíos (" + nombresDeMeses(ctx.mesesBaldios.filter((m) => !cubiertos.has(m))) + "): ahí cabría una cobertura o abono verde."),
    );
  }

  return REGLAS_ROTACION.map((regla) => out.get(regla)!);
}
