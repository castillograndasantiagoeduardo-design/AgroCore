/**
 * Verificación de la interfaz (fase 7 de la v2). Recorre Frontend/src y FALLA (código 1) si encuentra:
 *   1. Emojis o pictogramas (rangos Unicode de pictogramas, símbolos y banderas; Extended_Pictographic).
 *   2. Barras deslizantes: type="range" (los objetivos se eligen con botones segmentados).
 *   3. Rastros del módulo de fincas eliminado: su carpeta de features, su página o el componente para guardar fincas.
 *
 * Uso (desde Backend/): deno run -A scripts/verificar-ui.ts
 */
const RAIZ = new URL("../../Frontend/src/", import.meta.url);

/** Pictogramas: Extended_Pictographic cubre emojis y símbolos gráficos; se suman los indicadores regionales (banderas). */
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;
/** Nombre del módulo eliminado (se arma por partes para que este archivo no aparezca en la búsqueda de rastros). */
const MODULO = "fin" + "cas";
const REGLAS: { nombre: string; patron: RegExp }[] = [
  { nombre: "emoji o pictograma", patron: EMOJI },
  { nombre: 'barra deslizante type="range"', patron: /type\s*=\s*\{?\s*["'`]range["'`]/ },
  { nombre: "ruta o import del módulo eliminado", patron: new RegExp("features/" + MODULO + "|[\"'`(]/" + MODULO + "\\b|GuardarComo" + "Finca") },
];

interface Hallazgo {
  archivo: string;
  linea: number;
  regla: string;
  texto: string;
}

async function* recorrer(dir: URL): AsyncGenerator<URL> {
  for await (const e of Deno.readDir(dir)) {
    const u = new URL(e.name + (e.isDirectory ? "/" : ""), dir);
    if (e.isDirectory) {
      yield* recorrer(u);
    } else if (/\.(ts|tsx|css|json|md)$/.test(e.name)) yield u;
  }
}

const hallazgos: Hallazgo[] = [];
let archivos = 0;
for await (const u of recorrer(RAIZ)) {
  archivos++;
  const rel = decodeURIComponent(u.pathname).replace(decodeURIComponent(RAIZ.pathname), "Frontend/src/");
  const lineas = (await Deno.readTextFile(u)).split("\n");
  lineas.forEach((l, i) => {
    // ©, ® y ™ son símbolos de texto (atribuciones de los mapas), no emojis.
    const sinMarcas = l.replace(/[©®™]/g, "");
    for (const r of REGLAS) if (r.patron.test(sinMarcas)) hallazgos.push({ archivo: rel, linea: i + 1, regla: r.nombre, texto: l.trim().slice(0, 100) });
  });
}
// También deben haber desaparecido la carpeta y la página del módulo eliminado.
for (const ruta of ["features/" + MODULO, "app/(panel)/" + MODULO]) {
  try {
    await Deno.stat(new URL(ruta, RAIZ));
    hallazgos.push({ archivo: "Frontend/src/" + ruta, linea: 0, regla: "la carpeta del módulo eliminado todavía existe", texto: "" });
  } catch { /* no existe: bien */ }
}

for (const h of hallazgos) console.log("✗ " + h.regla + " · " + h.archivo + ":" + h.linea + " · " + h.texto);
console.log("Archivos revisados: " + archivos + " · problemas: " + hallazgos.length);
Deno.exit(hallazgos.length === 0 ? 0 : 1);
