/**
 * Composición del ticket térmico del terreno (servicio de dominio puro).
 *
 * Devuelve líneas YA cortadas al ancho de la impresora (32 caracteres en 58 mm, fuente A) con su estilo
 * (título, negrita, normal, separador, centrado). Sin bytes ESC/POS (eso vive en platform) y sin Date:
 * la fecha entra ya formateada desde el caso de uso (que la toma de IReloj).
 */
import type { ComparacionRotacionesDto, LineaTicketDto, PerfilTerrenoDto } from "@agrocore/contracts";
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
function rangosMeses(meses: readonly number[]): string {
  if (meses.length === 0) return "ninguno";
  return [...meses].sort((a, b) => a - b).map(abrev).join(",");
}

export interface DatosTicket {
  nombre: string | null;
  /** Fecha ya formateada (la da el caso de uso con IReloj). */
  fecha: string;
  terreno: PerfilTerrenoDto;
  /** null si el sitio no es apto (no hay rotaciones). */
  comparacion: ComparacionRotacionesDto | null;
  ancho: number;
}

export function componerTicketTerreno(d: DatosTicket): LineaTicketDto[] {
  const w = d.ancho;
  const out: LineaTicketDto[] = [];
  const push = (texto: string, estilo: LineaTicketDto["estilo"] = "normal") => {
    for (const t of cortarTexto(texto, w)) out.push({ texto: t, estilo });
  };
  const fila = (k: string, v: string, estilo: LineaTicketDto["estilo"] = "normal") => {
    for (const t of filaClaveValor(k, v, w)) out.push({ texto: t, estilo });
  };
  const separador = () => out.push({ texto: "-".repeat(w), estilo: "separador" });

  const u = d.terreno.ubicacion;
  out.push({ texto: "AGROCORE", estilo: "titulo" });
  push("Resumen del terreno", "centrado");
  separador();
  if (d.nombre) push(d.nombre, "negrita");
  fila("Lat", u.latitud.toFixed(4));
  fila("Lon", u.longitud.toFixed(4));
  if (u.areaHa !== null) fila("Area", u.areaHa + " ha");
  fila("Fecha", d.fecha);
  separador();

  push("APTITUD", "negrita");
  push(d.terreno.mensajeAptitud, d.terreno.aptitud === "apto" ? "normal" : "negrita");
  if (d.terreno.elevacionM !== null) fila("Elevación", d.terreno.elevacionM + " m");
  if (d.terreno.pendientePct !== null) fila("Pendiente", d.terreno.pendientePct + " %");
  const s = d.terreno.suelo;
  fila("Suelo", s ? (s.textura ?? "?") + " pH " + (s.ph ?? "?") : "sin dato");
  if (d.terreno.cobertura) fila("MODIS", d.terreno.cobertura.nombre.slice(0, w - 7));

  if (d.comparacion) {
    const c = d.comparacion;
    separador();
    push("CLIMA", "negrita");
    fila("Lluvia/año", Math.round(c.clima.lluviaAnualMm) + " mm");
    fila("Clima", c.sitio.clasificacionClimatica.replace("_", " "));
    fila("Baldío", rangosMeses(c.terreno.mesesBaldios));
    const vulnerables = c.calendario.filter((m) => m.vulnerabilidad.severidadMaxima === "alta" || m.vulnerabilidad.severidadMaxima === "media").map((m) => m.mes);
    fila("Vulnerable", rangosMeses(vulnerables));
    separador();
    push("ESTRATEGIAS (2 años)", "negrita");
    for (const e of c.estrategias) {
      const marca = e.id === c.estrategiaMejorPuntuada ? "*" : " ";
      fila(marca + e.id + " " + e.nombre.slice(0, w - 9), String(e.puntajeTotal), "negrita");
      push("  " + e.secuencia.filter((p) => !p.continua).map((p) => p.cultivoNombre.split(" (")[0]).join(">"));
    }
    push("* mejor puntuada con sus prioridades");
    const oportunidad = c.oportunidades[0];
    if (oportunidad) {
      separador();
      push("OPORTUNIDAD", "negrita");
      push(oportunidad.texto);
    }
  } else {
    separador();
    push("Sin rotaciones: el sitio no es apto para sembrar.");
  }

  separador();
  push("Fuentes: " + d.terreno.fuentes.map((f) => f.split(" (")[0]).join("; "));
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
