/**
 * EscPosWindowsPrinter: implementa IImpresoraTermica para una térmica ESC/POS (Xprinter XP-58, 58 mm)
 * COMPARTIDA en Windows, en el mismo equipo que el backend.
 *
 *  1. Convierte las líneas del ticket a bytes ESC/POS:
 *       ESC @          inicializar
 *       ESC t n        página de códigos (n = 2 → PC850; 19 → PC858 en muchas Xprinter)
 *       ESC a n        alineación (0 izquierda, 1 centro)
 *       ESC E n        negrita
 *       GS ! n         tamaño (0x11 = doble ancho y doble alto, para el título)
 *       LF             avance de línea
 *       GS V 66 0      corte parcial (si la impresora tiene cortador)
 *  2. Codifica el texto en CP850/858 (tildes, ñ, ¿, ¡, °).
 *  3. Escribe un archivo temporal y lo envía EN CRUDO con `cmd /c copy /b <archivo> \\localhost\<impresora>`.
 *
 * Paso manual del usuario: Propiedades de impresora → Compartir → nombre "XP58" (IMPRESORA_COMPARTIDA).
 * Cualquier fallo → Result.err(ImpresoraNoDisponibleError), nunca throw.
 */
import { type IImpresoraTermica, ImpresoraNoDisponibleError } from "@agrocore/core";
import type { LineaTicketDto } from "@agrocore/contracts";
import { type DomainError, Result } from "@agrocore/shared-kernel";

export interface EscPosWindowsConfig {
  /** Nombre con el que se compartió la impresora en Windows (por defecto "XP58"). */
  impresoraCompartida?: string;
  /** Valor n de ESC t n (por defecto 2 = PC850). Confirmarlo en la hoja de autoprueba (FEED + encender). */
  codepage?: number;
  /** Equipo que comparte la impresora (por defecto "localhost"). */
  host?: string;
  /** true si la impresora tiene cortador (envía GS V). La XP-58 básica no lo tiene. */
  cortar?: boolean;
  /** Plataforma (inyectable para tests); por defecto Deno.build.os. */
  sistemaOperativo?: string;
  /** Escribe los bytes en un archivo temporal y devuelve su ruta (inyectable para tests sin disco). */
  escribirTemporal?: (bytes: Uint8Array) => Promise<string>;
  /** Ejecutor del comando (inyectable para tests). */
  ejecutar?: (archivo: string, destino: string) => Promise<{ codigo: number; salida: string }>;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Tabla Unicode → CP850 para los caracteres no ASCII que usa el español (y algunos útiles).
 * PC858 es igual a PC850 salvo 0xD5 (€ en vez de ı).
 */
const CP850: Readonly<Record<string, number>> = {
  "Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85, "ç": 0x87, "ê": 0x88, "ë": 0x89, "è": 0x8a,
  "ï": 0x8b, "î": 0x8c, "ì": 0x8d, "Ä": 0x8e, "É": 0x90, "ô": 0x93, "ö": 0x94, "ò": 0x95, "û": 0x96, "ù": 0x97,
  "Ö": 0x99, "Ü": 0x9a, "á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ª": 0xa6, "º": 0xa7,
  "¿": 0xa8, "¡": 0xad, "«": 0xae, "»": 0xaf, "Á": 0xb5, "Â": 0xb6, "À": 0xb7, "Ê": 0xd2, "Ë": 0xd3, "È": 0xd4,
  "Í": 0xd6, "Î": 0xd7, "Ï": 0xd8, "Ó": 0xe0, "Ô": 0xe2, "Ò": 0xe3, "Ú": 0xe9, "Û": 0xea, "Ù": 0xeb, "°": 0xf8,
  "·": 0xfa, "²": 0xfd, "³": 0xfc, "±": 0xf1, "€": 0xd5,
};
/** Sustitutos ASCII para caracteres que la impresora no tiene (rayas, comillas tipográficas, flechas...). */
const SUSTITUTOS: Readonly<Record<string, string>> = {
  "–": "-", "—": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...", "→": ">", "↳": ">", "≥": ">=", "≤": "<=",
  "×": "x", "•": "*",
};

/** Codifica texto en CP850/858: ASCII tal cual, la tabla para lo demás y "?" si no hay equivalente. */
export function codificarCp850(texto: string): Uint8Array {
  const bytes: number[] = [];
  for (const caracter of texto.normalize("NFC")) {
    const codigo = caracter.codePointAt(0)!;
    if (codigo < 0x80) {
      bytes.push(codigo);
      continue;
    }
    if (CP850[caracter] !== undefined) {
      bytes.push(CP850[caracter]);
      continue;
    }
    const sustituto = SUSTITUTOS[caracter];
    if (sustituto) {
      for (const s of sustituto) bytes.push(s.charCodeAt(0));
      continue;
    }
    // Quitar tildes que no estén en la tabla (ej. "ã" → "a").
    const base = caracter.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    bytes.push(base.length === 1 && base.charCodeAt(0) < 0x80 ? base.charCodeAt(0) : 0x3f);
  }
  return new Uint8Array(bytes);
}

/** Convierte las líneas del ticket a un flujo de bytes ESC/POS. */
export function construirBytesEscPos(lineas: readonly LineaTicketDto[], opciones: { codepage: number; cortar: boolean }): Uint8Array {
  const partes: number[] = [ESC, 0x40, ESC, 0x74, opciones.codepage];
  const agregar = (bytes: ArrayLike<number>) => {
    for (let i = 0; i < bytes.length; i++) partes.push(bytes[i]);
  };
  for (const l of lineas) {
    const centrado = l.estilo === "titulo" || l.estilo === "centrado";
    const negrita = l.estilo === "titulo" || l.estilo === "negrita";
    agregar([ESC, 0x61, centrado ? 1 : 0]);
    agregar([ESC, 0x45, negrita ? 1 : 0]);
    agregar([GS, 0x21, l.estilo === "titulo" ? 0x11 : 0x00]);
    agregar(codificarCp850(l.texto));
    partes.push(LF);
  }
  agregar([ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0x00]);
  agregar([LF, LF, LF, LF]); // avance para poder cortar el papel a mano
  if (opciones.cortar) agregar([GS, 0x56, 66, 0]);
  return new Uint8Array(partes);
}

async function escribirArchivoTemporal(bytes: Uint8Array): Promise<string> {
  const archivo = await Deno.makeTempFile({ prefix: "agrocore-ticket-", suffix: ".bin" });
  await Deno.writeFile(archivo, bytes);
  return archivo;
}

async function ejecutarCopy(archivo: string, destino: string): Promise<{ codigo: number; salida: string }> {
  const comando = new Deno.Command("cmd", { args: ["/c", "copy", "/b", archivo, destino], stdout: "piped", stderr: "piped" });
  const r = await comando.output();
  const decodificador = new TextDecoder();
  return { codigo: r.code, salida: (decodificador.decode(r.stdout) + " " + decodificador.decode(r.stderr)).trim() };
}

export class EscPosWindowsPrinter implements IImpresoraTermica {
  private readonly impresora: string;
  private readonly codepage: number;
  private readonly host: string;
  private readonly cortar: boolean;
  private readonly so: string;
  private readonly ejecutar: (archivo: string, destino: string) => Promise<{ codigo: number; salida: string }>;
  private readonly escribirTemporal: (bytes: Uint8Array) => Promise<string>;

  constructor(config: EscPosWindowsConfig = {}) {
    this.impresora = config.impresoraCompartida ?? "XP58";
    this.codepage = config.codepage ?? 2;
    this.host = config.host ?? "localhost";
    this.cortar = config.cortar ?? false;
    this.so = config.sistemaOperativo ?? Deno.build.os;
    this.ejecutar = config.ejecutar ?? ejecutarCopy;
    this.escribirTemporal = config.escribirTemporal ?? escribirArchivoTemporal;
  }

  get destino(): string {
    return "\\\\" + this.host + "\\" + this.impresora;
  }

  async imprimir(lineas: readonly LineaTicketDto[]): Promise<Result<{ impresora: string }, DomainError>> {
    if (this.so !== "windows") {
      return Result.err(new ImpresoraNoDisponibleError(this.impresora, "la impresión directa solo funciona con el backend en Windows"));
    }
    let archivo: string | null = null;
    try {
      archivo = await this.escribirTemporal(construirBytesEscPos(lineas, { codepage: this.codepage, cortar: this.cortar }));
      const r = await this.ejecutar(archivo, this.destino);
      // copy devuelve 0 aunque falle en algunas versiones: se revisa también la salida ("1 archivo(s) copiado(s)").
      const copiado = /\b1\b.*(copiad|copied)/i.test(r.salida);
      if (r.codigo !== 0 || !copiado) {
        return Result.err(new ImpresoraNoDisponibleError(this.impresora, "copy /b a " + this.destino + " falló: " + (r.salida || "código " + r.codigo)));
      }
      return Result.ok({ impresora: this.destino });
    } catch (error) {
      return Result.err(new ImpresoraNoDisponibleError(this.impresora, error instanceof Error ? error.message : String(error)));
    } finally {
      if (archivo) await Deno.remove(archivo).catch(() => {}); // en tests la ruta es ficticia: no se borra nada
    }
  }
}
