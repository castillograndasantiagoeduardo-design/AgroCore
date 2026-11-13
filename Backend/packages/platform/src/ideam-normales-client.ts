/**
 * IdeamNormalesClient: implementa INormalesClimatologicasProvider con el dataset abierto
 * "Normales Climatológicas de Colombia" del IDEAM en datos.gov.co (id nsz2-kzcq, API Socrata).
 *
 * Cada fila del dataset es (estación, parámetro, periodo) con 12 columnas ene..dic.
 * Pedimos las del departamento y periodo configurados, las agrupamos por estación y solo
 * aceptamos estaciones que tengan los 4 parámetros completos:
 *   PRECIPITACIÓN (mm/mes), TEMPERATURA MÍNIMA, TEMPERATURA MEDIA, TEMPERATURA MÁXIMA (°C).
 *
 * Caché en memoria: las normales cambian cada 10 años; con una consulta por arranque basta.
 */
import {
  ClimaProveedorNoDisponibleError,
  distanciaKm,
  type INormalesClimatologicasProvider,
  type NormalClimatologica,
  type NormalMensual,
} from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";

const FUENTE = "IDEAM – Normales climatológicas";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const PARAMETROS = {
  lluviaMm: "PRECIPITACIÓN",
  tempMinC: "TEMPERATURA MÍNIMA",
  tempMediaC: "TEMPERATURA MEDIA",
  tempMaxC: "TEMPERATURA MÁXIMA",
} as const;

type FilaNormal = Record<(typeof MESES)[number], string | undefined> & {
  periodo: string;
  par_metro: string;
  c_digo: string;
  estaci_n: string;
  municipio: string;
  altitud_m: string;
  latitud: string;
  longitud: string;
};

export interface IdeamNormalesConfig {
  /** Departamentos donde buscar estaciones (Duitama: Boyacá). */
  departamentos?: string[];
  /** Periodo de la normal; por defecto la vigente de la OMM, 1991-2020. */
  periodo?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Caja envolvente aproximada de Colombia continental e insular (grados), con margen de ~25 km. */
const CAJA_COLOMBIA = { sur: -4.5, norte: 13.7, oeste: -82, este: -66.6 } as const;

export class IdeamNormalesClient implements INormalesClimatologicasProvider {
  private readonly departamentos: string[];
  private readonly periodo: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private estaciones: NormalClimatologica[] | null = null;

  constructor(config: IdeamNormalesConfig = {}) {
    this.departamentos = config.departamentos ?? ["Boyacá"];
    this.periodo = config.periodo ?? "1991-2020";
    this.baseUrl = config.baseUrl ?? "https://www.datos.gov.co/resource/nsz2-kzcq.json";
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }


  async estacionMasCercana(latitud: number, longitud: number): Promise<
    Result<{ normal: NormalClimatologica; distanciaKm: number } | null, DomainError>
  > {
    // El IDEAM solo tiene estaciones en Colombia: fuera de su caja envolvente no hay nada que buscar
    // (evita descargar el catálogo de estaciones para Iowa, Kenia o España).
    const c = CAJA_COLOMBIA;
    if (latitud < c.sur || latitud > c.norte || longitud < c.oeste || longitud > c.este) return Result.ok(null);
    if (!this.estaciones) {
      const cargadas = await this.cargarEstaciones();
      if (!cargadas.ok) return cargadas;
      this.estaciones = cargadas.value;
    }

    let mejor: { normal: NormalClimatologica; distanciaKm: number } | null = null;
    for (const normal of this.estaciones) {
      const d = distanciaKm(latitud, longitud, normal.latitud, normal.longitud);
      if (!mejor || d < mejor.distanciaKm) mejor = { normal, distanciaKm: d };
    }
    return Result.ok(mejor);
  }

  private async cargarEstaciones(): Promise<Result<NormalClimatologica[], DomainError>> {
    const url = new URL(this.baseUrl);
    const deptos = this.departamentos.map((d) => "'" + d.replaceAll("'", "''") + "'").join(",");
    url.searchParams.set("$where", "periodo='" + this.periodo + "' AND departamento in(" + deptos + ")");
    url.searchParams.set("$limit", "50000");

    let filas: FilaNormal[];
    try {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!respuesta.ok) return Result.err(new ClimaProveedorNoDisponibleError("IDEAM", "HTTP " + respuesta.status));
      filas = await respuesta.json();
    } catch (error) {
      return Result.err(new ClimaProveedorNoDisponibleError("IDEAM", error instanceof Error ? error.message : String(error)));
    }
    if (!Array.isArray(filas)) return Result.err(new ClimaProveedorNoDisponibleError("IDEAM", "respuesta inesperada"));

    // Agrupar filas por estación
    const porEstacion = new Map<string, FilaNormal[]>();
    for (const f of filas) porEstacion.set(f.c_digo, [...(porEstacion.get(f.c_digo) ?? []), f]);

    const [anioInicio, anioFin] = this.periodo.split("-").map(Number);
    const estaciones: NormalClimatologica[] = [];

    for (const [codigo, filasEstacion] of porEstacion) {
      const valores = {} as Record<keyof typeof PARAMETROS, number[]>;
      let completa = true;
      for (const [campo, parametro] of Object.entries(PARAMETROS) as [keyof typeof PARAMETROS, string][]) {
        const fila = filasEstacion.find((f) => f.par_metro === parametro);
        // Un mes vacío ("" o ausente) cuenta como faltante; Number("") daría 0, por eso se filtra antes.
        const doce = fila ? MESES.map((m) => (fila[m] && fila[m]!.trim() !== "" ? Number(fila[m]) : NaN)) : [];
        if (doce.length !== 12 || doce.some((v) => !Number.isFinite(v))) {
          completa = false;
          break;
        }
        valores[campo] = doce;
      }
      if (!completa) continue;

      const f = filasEstacion[0];
      const meses: NormalMensual[] = MESES.map((_, i) => ({
        mes: i + 1,
        lluviaMm: valores.lluviaMm[i],
        tempMinC: valores.tempMinC[i],
        tempMediaC: valores.tempMediaC[i],
        tempMaxC: valores.tempMaxC[i],
      }));
      estaciones.push({
        fuente: FUENTE + " " + this.periodo,
        codigoEstacion: codigo,
        estacion: f.estaci_n.trim().replace(/\s+/g, " "),
        municipio: f.municipio,
        latitud: Number(f.latitud),
        longitud: Number(f.longitud),
        altitudM: Number(f.altitud_m),
        anioInicio,
        anioFin,
        meses,
      });
    }
    return Result.ok(estaciones);
  }
}
