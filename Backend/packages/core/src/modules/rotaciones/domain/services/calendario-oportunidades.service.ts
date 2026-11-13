/**
 * Calendario de 12 meses del lote y oportunidades de rotación (servicio de dominio puro).
 *
 * Calendario: por mes, si el lote suele estar baldío (NDVI), si cae en temporada, su vulnerabilidad climática
 * y qué cultivos del plan ACTUAL (estrategia A, año 1) quedan expuestos a una amenaza media o alta.
 *
 * Oportunidades (solo con datos calculados):
 *   baldio_cobertura      meses baldíos (NDVI) → la cobertura / abono verde del catálogo que mejor encaja ahí
 *   temporada_vulnerable  la ventana con más amenazas medias o altas
 *   romper_ciclo_plagas   la actual repite familia → con qué cultivo de otra familia cortar el ciclo
 *   menor_demanda_agua    hay meses de déficit → la estrategia con mejor puntaje de agua
 *   mejorar_infiltracion  pendiente o lluvias extremas → cultivos de raíz profunda / cobertura alta
 *   sumar_ingreso         la estrategia de mayor ingreso frente a la actual
 */
import type {
  EstrategiaRotacionDto,
  MesCalendarioDto,
  MesVulnerabilidadDto,
  OportunidadDto,
  SeveridadAmenaza,
} from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import { type ContextoMotor, nombresDeMeses } from "./evaluar-paso.service.ts";
import type { SecuenciaEvaluada } from "./generar-estrategias.service.ts";
import { pasosSembrados, PENDIENTE_FUERTE_PCT } from "./reglas-rotacion.service.ts";

const PESO: Record<SeveridadAmenaza, number> = { baja: 1, media: 2, alta: 3 };
const fuerte = (s: SeveridadAmenaza) => PESO[s] >= 2;

/** ¿El cultivo sufre esta amenaza? (según sus tolerancias en el catálogo). */
function expuesto(c: Cultivo, tipo: string, tieneRiego: boolean): boolean {
  if (tipo === "helada") return c.toleranciaHelada !== "alta";
  if (tipo === "calor") return c.toleranciaCalor !== "alta";
  if (tipo === "deficit_hidrico") return !tieneRiego && c.toleranciaSequia !== "alta";
  if (tipo === "lluvia_extrema") return c.coberturaSuelo !== "alta";
  return false;
}

export function construirCalendario(
  ctx: ContextoMotor,
  actual: SecuenciaEvaluada,
  oportunidades: readonly OportunidadDto[],
): MesCalendarioDto[] {
  const vulnerabilidad = new Map<number, MesVulnerabilidadDto>(ctx.perfil.calendarioVulnerabilidad.map((v) => [v.mes, v]));
  const enTemporada = new Set(ctx.ventanas.flatMap((v) => v.mesesTemporada));
  const conOportunidad = new Set(oportunidades.flatMap((o) => o.meses));
  const anio1 = actual.evaluados.filter((e) => e.paso.anio === 1 && e.cultivo !== null);

  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const v = vulnerabilidad.get(mes) ?? { mes, nombreMes: NOMBRES_MES[i], amenazas: [], severidadMaxima: null };
    const amenazasFuertes = v.amenazas.filter((a) => fuerte(a.severidad));
    const expuestos = anio1
      .filter((e) => e.paso.mesesCiclo.includes(mes) && amenazasFuertes.some((a) => expuesto(e.cultivo!, a.tipo, ctx.tieneRiego)))
      .map((e) => e.cultivo!.nombre);
    return {
      mes,
      nombreMes: NOMBRES_MES[i],
      baldio: ctx.mesesBaldios.includes(mes),
      enTemporada: enTemporada.has(mes),
      vulnerabilidad: v,
      cultivosExpuestos: [...new Set(expuestos)],
      oportunidad: conOportunidad.has(mes),
    };
  });
}

/** Cobertura / abono verde que mejor encaja en unos meses: apta por temperatura media y por helada. */
export function mejorCoberturaPara(meses: readonly number[], catalogo: readonly Cultivo[], ctx: ContextoMotor): Cultivo | null {
  if (meses.length === 0) return null;
  const temp = meses.reduce((s, m) => s + (ctx.perfil.meses.find((x) => x.mes === m)?.tempMediaC ?? 0), 0) / meses.length;
  const hayHelada = meses.some((m) => ctx.perfil.resumen.mesesRiesgoHelada.includes(m));
  const candidatas = catalogo
    .filter((c) => c.esCobertura && c.aptitudPorTemperatura(temp) !== "no_apta" && (!hayHelada || c.toleranciaHelada !== "baja"))
    .sort((a, b) =>
      (a.aptitudPorTemperatura(temp) === "optima" ? 0 : 1) - (b.aptitudPorTemperatura(temp) === "optima" ? 0 : 1) ||
      Number(b.fijaNitrogeno) - Number(a.fijaNitrogeno) ||
      a.clave.localeCompare(b.clave)
    );
  return candidatas[0] ?? null;
}

export interface DatosOportunidades {
  ctx: ContextoMotor;
  catalogo: readonly Cultivo[];
  actual: SecuenciaEvaluada;
  estrategias: readonly EstrategiaRotacionDto[];
}

export function detectarOportunidades(d: DatosOportunidades): OportunidadDto[] {
  const { ctx } = d;
  const out: OportunidadDto[] = [];
  const A = d.estrategias[0];
  const otras = d.estrategias.slice(1);

  // 1. Meses baldíos → cobertura
  if (ctx.mesesBaldios.length > 0) {
    const cobertura = mejorCoberturaPara(ctx.mesesBaldios, d.catalogo, ctx);
    out.push({
      tipo: "baldio_cobertura",
      meses: [...ctx.mesesBaldios],
      texto: "En " + nombresDeMeses(ctx.mesesBaldios) + " el lote suele estar baldío (NDVI) → " +
        (cobertura
          ? "sembrar " + cobertura.nombre + " como cobertura" + (cobertura.fijaNitrogeno ? " (fija nitrógeno)" : "") + " para proteger el suelo."
          : "dejar el rastrojo en superficie: ninguna cobertura del catálogo es apta con el clima de esos meses."),
      fuentes: cobertura ? ["MODIS", "ECOCROP", "NASA POWER"] : ["MODIS", "NASA POWER"],
    });
  }

  // 2. Temporada más vulnerable
  const puntajeMes = (mes: number) =>
    (ctx.perfil.calendarioVulnerabilidad.find((v) => v.mes === mes)?.amenazas ?? []).reduce((s, a) => s + (fuerte(a.severidad) ? PESO[a.severidad] : 0), 0);
  const ventanasPuntuadas = ctx.ventanas
    .map((v) => ({ v, puntaje: v.meses.reduce((s, m) => s + puntajeMes(m), 0) }))
    .sort((a, b) => b.puntaje - a.puntaje);
  const peor = ventanasPuntuadas[0];
  if (peor && peor.puntaje > 0) {
    const meses = peor.v.meses.filter((m) => puntajeMes(m) > 0);
    const tipos = [...new Set(meses.flatMap((m) =>
      (ctx.perfil.calendarioVulnerabilidad.find((v) => v.mes === m)?.amenazas ?? []).filter((a) => fuerte(a.severidad)).map((a) => a.tipo.replace("_", " "))
    ))];
    out.push({
      tipo: "temporada_vulnerable",
      meses,
      texto: peor.v.nombre + " es la más vulnerable por " + tipos.join(", ") + " (" + nombresDeMeses(meses) + "): elegir ahí cultivos tolerantes o adelantar/atrasar la siembra.",
      fuentes: ["NASA POWER"],
    });
  } else {
    out.push({
      tipo: "temporada_vulnerable",
      meses: [],
      texto: "Ningún mes muestra amenazas climáticas medias o altas: el riesgo principal está en el manejo, no en el clima promedio.",
      fuentes: ["NASA POWER"],
    });
  }

  // 3. Romper el ciclo de plagas
  const repite = A.reglas.find((r) => r.regla === "no_repetir_familia");
  if (repite && !repite.cumple) {
    const principal = pasosSembrados(d.actual.evaluados)[0]?.cultivo ?? null;
    const alternativa = otras
      .flatMap((e) => e.secuencia)
      .find((p) => principal && p.cultivoClave !== "barbecho" && !p.familias.some((f) => principal.familias.includes(f)));
    if (principal && alternativa) {
      out.push({
        tipo: "romper_ciclo_plagas",
        meses: [],
        texto: "Romper el ciclo de " + principal.familias.join("/") + " (" + principal.plagasClave.slice(0, 2).join("; ") + ") con " +
          alternativa.cultivoNombre + ", de otra familia.",
        fuentes: ["ECOCROP", "Regla"],
      });
    }
  }

  // 4. Menor demanda de agua
  if (ctx.perfil.resumen.mesesDeficitHidrico.length > 0) {
    const mejorAgua = [...otras].sort((a, b) => b.puntajes.agua - a.puntajes.agua)[0];
    if (mejorAgua && mejorAgua.puntajes.agua > A.puntajes.agua) {
      out.push({
        tipo: "menor_demanda_agua",
        meses: [...ctx.perfil.resumen.mesesDeficitHidrico],
        texto: "Menor demanda de agua con la estrategia " + mejorAgua.id + " (" + mejorAgua.nombre + "): puntaje de agua " + mejorAgua.puntajes.agua +
          " frente a " + A.puntajes.agua + " de la actual; déficit en " + nombresDeMeses(ctx.perfil.resumen.mesesDeficitHidrico) + ".",
        fuentes: ["NASA POWER", "ECOCROP"],
      });
    }
  }

  // 5. Mejorar la infiltración
  const lluviaExtrema = ctx.perfil.resumen.mesesLluviaExtrema;
  if ((ctx.pendientePct !== null && ctx.pendientePct > 10) || lluviaExtrema.length > 0) {
    const profundas = [...new Set(otras.flatMap((e) => e.secuencia).filter((p) => {
      const c = d.catalogo.find((x) => x.clave === p.cultivoClave);
      return c && (c.profundidadRaiz === "profunda" || c.coberturaSuelo === "alta");
    }).map((p) => p.cultivoNombre))];
    if (profundas.length) {
      out.push({
        tipo: "mejorar_infiltracion",
        meses: [...lluviaExtrema],
        texto: "Mejorar la infiltración" + (ctx.pendientePct !== null && ctx.pendientePct > 10 ? " en " + ctx.pendientePct + " % de pendiente" : "") +
          (lluviaExtrema.length ? " y frente a las lluvias fuertes de " + nombresDeMeses(lluviaExtrema) : "") + " con " + profundas.slice(0, 3).join(", ") +
          " (raíz profunda o cobertura alta)" + (ctx.pendientePct !== null && ctx.pendientePct > PENDIENTE_FUERTE_PCT ? "; además, sembrar en curvas de nivel." : "."),
        fuentes: ctx.pendientePct !== null ? ["SRTM", "ECOCROP", "NASA POWER"] : ["NASA POWER", "ECOCROP"],
      });
    }
  }

  // 6. Sumar ingreso
  const mejorIngreso = [...otras].sort((a, b) => b.puntajes.ingreso - a.puntajes.ingreso)[0];
  if (mejorIngreso && mejorIngreso.puntajes.ingreso > A.puntajes.ingreso) {
    out.push({
      tipo: "sumar_ingreso",
      meses: [],
      texto: "Sumar ingreso con la estrategia " + mejorIngreso.id + " (" + mejorIngreso.nombre + "): referencia de ingreso " + mejorIngreso.puntajes.ingreso +
        " frente a " + A.puntajes.ingreso + " (cualitativa, sin precios).",
      fuentes: ["ECOCROP", "Regla"],
    });
  }
  return out;
}
