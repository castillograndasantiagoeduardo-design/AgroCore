/**
 * Utilidades compartidas por los tests nuevos de rotaciones: perfiles climáticos sintéticos, contexto del motor
 * y presencia local de prueba (sin red ni MySQL).
 */
import type { DatoConFuente, PerfilClimaticoDto, PresenciaLocalNivel } from "@agrocore/contracts";
import {
  calcularCalendarioVulnerabilidad,
  calcularEscalaIngreso,
  calcularTemporadasCultivo,
  construirVentanas,
  type ContextoMotor,
  type CrearCultivoDatos,
  Cultivo,
  et0MensualMm,
  type PresenciaMotor,
} from "../../src/index.ts";

const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export interface OpcionesPerfil {
  latitud: number;
  temp: number[];
  lluvia: number[];
  heladas?: number[];
  calor?: number[];
}

export function perfilSintetico(o: OpcionesPerfil): PerfilClimaticoDto {
  const promedio = o.lluvia.reduce((a, b) => a + b, 0) / 12;
  const meses = o.temp.map((t, i) => {
    const etoMm = Math.round(et0MensualMm(o.latitud, i + 1, t, t - 5, t + 5));
    const helada = o.heladas?.includes(i + 1) ?? false;
    return {
      mes: i + 1,
      nombreMes: NOMBRES[i],
      lluviaMm: o.lluvia[i],
      tempMediaC: t,
      tempMinC: t - 5,
      tempMaxC: t + 5,
      diasHeladaPromedio: helada ? 6 : 0,
      probabilidadHelada: helada ? 0.6 : 0,
      diasLluviaFuertePromedio: o.lluvia[i] > 150 ? 2 : 0,
      diasCalorPromedio: o.calor?.includes(i + 1) ? 8 : 0,
      etoMm,
      balanceHidricoMm: o.lluvia[i] - etoMm,
      temporada: (o.lluvia[i] >= promedio ? "lluviosa" : "seca") as "lluviosa" | "seca",
    };
  });
  return {
    latitud: o.latitud,
    longitud: 0,
    altitudReferenciaM: 500,
    altitudCeldaM: 500,
    ajusteTemperaturaC: 0,
    periodo: { desde: "1996-01-01", hasta: "2025-12-31", anios: 30 },
    fuente: "NASA POWER (sintético)",
    calibracion: null,
    umbrales: { heladaC: 2, lluviaFuerteMm: 20, calorC: 32 },
    meses,
    resumen: {
      lluviaAnualMm: o.lluvia.reduce((a, b) => a + b, 0),
      tempMediaAnualC: o.temp.reduce((a, b) => a + b, 0) / 12,
      etoAnualMm: meses.reduce((s, m) => s + m.etoMm, 0),
      indiceAridez: 0.8,
      regimenLluvias: "bimodal",
      mesesLluviosos: meses.filter((m) => m.temporada === "lluviosa").map((m) => m.mes),
      mesesSecos: meses.filter((m) => m.temporada === "seca").map((m) => m.mes),
      mesesRiesgoHelada: o.heladas ?? [],
      mesesCalor: o.calor ?? [],
      mesesDeficitHidrico: meses.filter((m) => m.lluviaMm < 0.5 * m.etoMm).map((m) => m.mes),
      mesesLluviaExtrema: [],
      clasificacionClimatica: "de_altura",
    },
    temporadasCultivo: calcularTemporadasCultivo(meses),
    calendarioVulnerabilidad: calcularCalendarioVulnerabilidad(meses),
    advertencias: [],
  };
}

export function contextoDe(p: PerfilClimaticoDto, cambios: Partial<ContextoMotor> = {}): ContextoMotor {
  const tieneRiego = cambios.tieneRiego ?? false;
  const temporadas = tieneRiego ? p.temporadasCultivo.conRiego : p.temporadasCultivo.secano;
  return {
    perfil: p,
    ventanas: construirVentanas(temporadas.length ? temporadas : p.temporadasCultivo.conRiego),
    tieneRiego,
    suelo: { ph: null, textura: null },
    pendientePct: null,
    mesesBaldios: [],
    excluidoPct: 0,
    ...cambios,
  };
}

/** Presencia de prueba: nivel y valor por hectárea (I$/ha) por clave; lo que no se indica queda "sin_datos". */
export function presenciaDePrueba(niveles: Record<string, PresenciaLocalNivel>, valores: Record<string, number> = {}): PresenciaMotor {
  const dato = (valor: number | null, unidad: string, fuente: "EVA" | "FAOSTAT"): DatoConFuente<number> => ({
    valor,
    unidad,
    fuente,
    tipo: fuente === "EVA" ? "medido" : "referencia",
  });
  return {
    disponible: true,
    nivel: (clave) => niveles[clave] ?? "sin_datos",
    areaHa: (clave) => dato(niveles[clave] === "local" ? 100 : null, "ha", "EVA"),
    valorHa: (clave) => dato(valores[clave] ?? null, "I$/ha", "FAOSTAT"),
  };
}

/** Contexto con la presencia y la escala de ingreso del catálogo calculadas como lo hace el motor. */
export function conPresencia(ctx: ContextoMotor, catalogo: readonly Cultivo[], presencia: PresenciaMotor): ContextoMotor {
  return { ...ctx, presencia, escalaIngreso: calcularEscalaIngreso(catalogo, presencia) ?? undefined };
}

/** Copia de un cultivo con otros datos (la ficha se reconstruye desde su snapshot: los rangos vuelven a ser [min, max]). */
export function conCambios(c: Cultivo, cambios: Partial<CrearCultivoDatos>): Cultivo {
  const s = c.toSnapshot();
  const par = (r: { min: number; max: number }): [number, number] => [r.min, r.max];
  const r = Cultivo.crear({
    ...s,
    cicloDias: par(s.cicloDias),
    temperaturaOptimaC: par(s.temperaturaOptimaC),
    temperaturaAbsolutaC: par(s.temperaturaAbsolutaC),
    lluviaAnualOptimaMm: par(s.lluviaAnualOptimaMm),
    aguaCicloMm: par(s.aguaCicloMm),
    phOptimo: par(s.phOptimo),
    ...cambios,
  });
  if (!r.ok) throw new Error("Cultivo de prueba inválido: " + r.error.message);
  return r.value;
}
