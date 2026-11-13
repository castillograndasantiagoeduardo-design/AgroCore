/**
 * Composición del ticket térmico del terreno (servicio de dominio puro).
 *
 * Devuelve líneas YA cortadas al ancho de la impresora (32 caracteres en 58 mm, fuente A) con su estilo
 * (título, negrita, normal, separador, centrado). Sin bytes ESC/POS (eso vive en platform) y sin Date:
 * la fecha entra ya formateada desde el caso de uso (que la toma de IReloj).
 */
import {
  type DatoConFuente,
  type LineaTicketDto,
  NOMBRE_FUENTE,
  NOMBRE_OBJETIVO,
  type Objetivo,
  type RecomendacionRapidaDto,
  textoSinDatos,
} from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";

export const AVISO_TICKET = "Herramienta de apoyo. Validar con agrónomo local.";

/** Corta un texto en líneas de `ancho` caracteres sin partir palabras (salvo palabras más largas que el ancho). */
export function cortarTexto(texto: string, ancho: number): string[] {
  const palabras = texto.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (let palabra of palabras) {
    while (palabra.length > ancho) {
      if (actual) {
        lineas.push(actual);
        actual = "";
      }
      lineas.push(palabra.slice(0, ancho));
      palabra = palabra.slice(ancho);
    }
    if (!actual) actual = palabra;
    else if ((actual + " " + palabra).length <= ancho) actual += " " + palabra;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

/** "Etiqueta ........ valor" en una línea; si no cabe, en dos. */
export function filaClaveValor(clave: string, valor: string, ancho: number): string[] {
  const libre = ancho - clave.length - valor.length;
  if (libre >= 1) return [clave + " ".repeat(libre) + valor];
  return [...cortarTexto(clave, ancho), ...cortarTexto("  " + valor, ancho)];
}

const abrev = (m: number) => NOMBRES_MES[m - 1].slice(0, 3);
const r1 = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

export interface DatosTicket {
  nombre: string | null;
  /** Fecha ya formateada (la da el caso de uso con IReloj). */
  fecha: string;
  rapida: RecomendacionRapidaDto;
  objetivo: Objetivo;
  ancho: number;
}

/** "1.234 mm (NASA POWER)" o "Sin datos de NASA POWER" (nunca un número sin fuente). */
function textoDato(d: DatoConFuente<number>): string {
  if (d.valor === null) return textoSinDatos(d.fuente);
  return r1(d.valor) + (d.unidad ? " " + d.unidad : "") + (d.tipo === "estimado" ? " aprox." : "");
}

export function componerTicketRecomendacion(d: DatosTicket): LineaTicketDto[] {
  const w = d.ancho;
  const out: LineaTicketDto[] = [];
  const push = (texto: string, estilo: LineaTicketDto["estilo"] = "normal") => {
    for (const t of cortarTexto(texto, w)) out.push({ texto: t, estilo });
  };
  const fila = (k: string, v: string, estilo: LineaTicketDto["estilo"] = "normal") => {
    for (const t of filaClaveValor(k, v, w)) out.push({ texto: t, estilo });
  };
  const separador = () => out.push({ texto: "-".repeat(w), estilo: "separador" });
  const r = d.rapida;
  const u = r.ubicacion;

  out.push({ texto: "AGROCORE", estilo: "titulo" });
  push("Qué sembrar en cada época", "centrado");
  separador();
  if (d.nombre) push(d.nombre, "negrita");
  fila("Lat", u.latitud.toFixed(4));
  fila("Lon", u.longitud.toFixed(4));
  if (u.areaHa !== null) fila("Área", r1(u.areaHa) + " ha");
  fila("Fecha", d.fecha);
  separador();

  push("APTITUD", "negrita");
  push(r.aptitud.mensaje, r.aptitud.estado === "apto" ? "normal" : "negrita");
  if (!r.aptitud.viasVerificadas) push("(sin verificar vías: OpenStreetMap no respondió)");
  separador();
  push("CLIMA", "negrita");
  fila("Lluvia/año", textoDato(r.resumenClima.lluviaAnualMm));
  fila("T media", textoDato(r.resumenClima.tempMediaC));
  fila("Altitud", textoDato(r.resumenClima.altitudM));

  if (r.aptitud.estado === "apto" && r.epocas.length) {
    separador();
    push("ÉPOCAS · " + NOMBRE_OBJETIVO[d.objetivo].toUpperCase(), "negrita");
    for (const e of r.epocas) {
      const rec = r.recomendaciones[d.objetivo].find((x) => x.epocaId === e.id);
      push(e.nombre, "negrita");
      if (!rec) continue;
      push("> " + rec.queSembrar);
      if (rec.alternativa) {
        push("  Alternativa: " + rec.alternativa.nombre + (rec.alternativa.presenciaLocal === "poco_comun" ? " (poco común)" : ""));
      }
    }
    if (r.recomendaciones[d.objetivo].some((x) => x.alternativa?.presenciaLocal === "poco_comun")) {
      push("Poco común = poco sembrado en su zona: confirme comprador.");
    }
  } else if (r.aptitud.estado !== "apto") {
    separador();
    push("Sin cultivos: el sitio no es apto para sembrar.");
  }

  separador();
  const fuentes = new Set<string>();
  for (const f of r.aptitud.fuentes) fuentes.add(NOMBRE_FUENTE[f]);
  fuentes.add(NOMBRE_FUENTE[r.resumenClima.lluviaAnualMm.fuente]);
  for (const rec of r.recomendaciones[d.objetivo]) for (const f of rec.fuentes) if (f !== "CALCULO") fuentes.add(NOMBRE_FUENTE[f]);
  if (r.presenciaLocal) fuentes.add(NOMBRE_FUENTE[r.presenciaLocal.fuente]);
  push("Fuentes: " + [...fuentes].join("; "));
  separador();
  push(AVISO_TICKET, "centrado");
  return out;
}

/** Fecha corta "12 nov 2026 14:05" (UTC) a partir de un Date que da IReloj. */
export function formatearFechaTicket(fecha: Date): string {
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  const hh = String(fecha.getUTCHours()).padStart(2, "0");
  const mi = String(fecha.getUTCMinutes()).padStart(2, "0");
  return dd + " " + abrev(fecha.getUTCMonth() + 1).toLowerCase() + " " + fecha.getUTCFullYear() + " " + hh + ":" + mi + " UTC";
}
