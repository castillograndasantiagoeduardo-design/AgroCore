/**
 * Auditoría de "cero datos inventados" (fase 2.5): busca CIFRAS ESCRITAS A MANO dentro de textos para el usuario.
 *
 * Revisa:
 *   - Backend/packages/core/src/modules/** (servicios de dominio y casos de uso): literales de texto ("...", '...',
 *     y las partes fijas de `...`) que contienen una cifra Y palabras (una frase con un número).
 *   - Frontend/src/**: lo mismo en .ts/.tsx, más el texto JSX entre etiquetas.
 * Ignora: imports, clases CSS (className, Tailwind), rutas, claves técnicas, fechas ISO, colores, comentarios.
 *
 * Cada caso debe estar JUSTIFICADO en scripts/auditar-datos.permitidos.json ({ archivo, texto, justificacion }):
 * por ejemplo "58 mm" (ancho del papel del ticket) o "100 ha" (límite del sistema, sale de AREA_MAXIMA_HA). Lo que no esté
 * justificado se reporta y el script termina con código 1. Las cifras que vienen de datos (DatoConFuente) se insertan
 * por interpolación y no aparecen como literal, así que no cuentan.
 *
 * Uso (desde Backend/): deno run -A scripts/auditar-datos.ts
 */
const RAIZ = new URL("../../", import.meta.url);
const CARPETAS = ["Backend/packages/core/src/modules", "Frontend/src"];

interface Hallazgo {
  archivo: string;
  linea: number;
  texto: string;
}
interface Permitido {
  archivo: string;
  texto: string;
  justificacion: string;
}

const permitidos: Permitido[] = JSON.parse(await Deno.readTextFile(new URL("auditar-datos.permitidos.json", import.meta.url)));

async function* recorrer(dir: URL): AsyncGenerator<URL> {
  for await (const e of Deno.readDir(dir)) {
    const u = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
    if (e.isDirectory) {
      if (["node_modules", ".next", "tests"].includes(e.name)) continue;
      yield* recorrer(u);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !/MODULE|LAYER/.test(e.name)) yield u;
  }
}

/** Quita comentarios // y /* *\/ (aproximado, suficiente para este código). */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, (m, p) => p + " ".repeat(m.length - p.length));
}

/** ¿Es una frase con cifra (texto para personas) y no un valor técnico? */
function esFraseConCifra(t: string): boolean {
  const original = t.trim();
  if (/[;{}]|=>|\breturn\b|\bconst\b/.test(original)) return false; // fragmento de código, no texto
  const tokens = original.split(/\s+/);
  const css = tokens.filter((x) => /^[!a-z]+(-[\w.[\]%/:#()]+)+$/.test(x) || /^[a-z]+:[\w-]+/.test(x)).length;
  if (tokens.length && css >= Math.ceil(tokens.length / 2)) return false; // clases CSS
  // Nombres propios con cifras (MOD13Q1, MCD12Q1, ET0, FAO-56, SRTM30, M49, I$) no son datos.
  const s = original.replace(/\b[A-Za-z]+-?\d+[A-Za-z0-9]*\b/g, "X").replace(/I\$/g, "X");
  if (!/\d/.test(s)) return false;
  if (!/[a-záéíóúñ]{3,}/i.test(s)) return false; // sin palabras: no es una frase
  if (/^(\.{0,2}\/|@|https?:|jsr:|npm:|node:)/.test(s)) return false; // rutas, imports, URLs
  if (/^[\w-]+(\.[\w-]+)+$/.test(s)) return false; // nombres de archivo
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return false; // colores
  if (/^\d{4}-\d{2}(-\d{2})?/.test(s)) return false; // fechas ISO
  if (/^[a-z0-9_:.\-[\]/ ]+$/.test(s) && !/\s[a-záéíóúñ]{3,}\s/.test(" " + s + " ")) return false; // claves técnicas y clases CSS
  if (/^(grid|flex|text|bg|border|rounded|p|px|py|m|mx|my|w|h|min|max|gap|space|inset|top|left|right|bottom|z|shadow|ring|font|leading|tracking|opacity|duration|translate|col|row)-/.test(s)) return false;
  return true;
}

function extraer(archivo: string, fuente: string): Hallazgo[] {
  const limpio = sinComentarios(fuente);
  const out: Hallazgo[] = [];
  const lineaDe = (i: number) => limpio.slice(0, i).split("\n").length;
  // Literales "..." y '...'
  for (const m of limpio.matchAll(/(["'])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const antes = limpio.slice(Math.max(0, m.index! - 40), m.index!);
    if (/(import|from|className=|class=|href=|src=|style=|key=|id=|d=|viewBox=|fill=|stroke=)\s*$/.test(antes)) continue;
    if (/\bimport\s*\(\s*$/.test(antes)) continue;
    if (esFraseConCifra(m[2])) out.push({ archivo, linea: lineaDe(m.index!), texto: m[2] });
  }
  // Partes fijas de las plantillas `...${x}...`
  for (const m of limpio.matchAll(/`((?:\\.|[^`\\])*)`/g)) {
    const antes = limpio.slice(Math.max(0, m.index! - 40), m.index!);
    if (/className=\{?\s*$/.test(antes)) continue;
    for (const parte of m[1].split(/\$\{[^}]*\}/)) if (esFraseConCifra(parte)) out.push({ archivo, linea: lineaDe(m.index!), texto: parte });
  }
  // Texto JSX entre etiquetas
  if (archivo.endsWith(".tsx")) {
    for (const m of limpio.matchAll(/>([^<>{}]*\d[^<>{}]*)</g)) {
      if (esFraseConCifra(m[1])) out.push({ archivo, linea: lineaDe(m.index!), texto: m[1].trim() });
    }
  }
  return out;
}

const hallazgos: Hallazgo[] = [];
for (const carpeta of CARPETAS) {
  const dir = new URL(carpeta + "/", RAIZ);
  try {
    for await (const u of recorrer(dir)) {
      const rel = decodeURIComponent(u.pathname).replace(decodeURIComponent(RAIZ.pathname), "");
      hallazgos.push(...extraer(rel, await Deno.readTextFile(u)));
    }
  } catch (e) {
    console.error("No se pudo recorrer " + carpeta + ": " + (e instanceof Error ? e.message : e));
    Deno.exit(2);
  }
}

const justificado = (h: Hallazgo) => permitidos.some((p) => h.archivo.endsWith(p.archivo) && h.texto.includes(p.texto));
const sinJustificar = hallazgos.filter((h) => !justificado(h));
const justificados = hallazgos.length - sinJustificar.length;

for (const h of sinJustificar) console.log("SIN JUSTIFICAR · " + h.archivo + ":" + h.linea + " · " + JSON.stringify(h.texto.slice(0, 120)));
console.log("\nCifras escritas a mano en textos para el usuario: " + hallazgos.length + " · justificadas: " + justificados + " · sin justificar: " + sinJustificar.length);
Deno.exit(sinJustificar.length === 0 ? 0 : 1);
