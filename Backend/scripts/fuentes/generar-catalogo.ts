/**
 * Genera `packages/database/src/catalogos/catalogo-cultivos.datos.ts` SOLO con valores que tienen fuente:
 *   - FAO ECOCROP (Docs/fuentes/ecocrop_registros.tsv, extraído con extraer-ecocrop.ts)
 *   - FAOSTAT (packages/platform/data/faostat-cultivos.json, extraído con extraer-faostat.ts)
 * Lo que la fuente no trae queda en `camposSinFuente` y el motor no lo usa para decidir.
 *
 * Uso (desde Backend/):  deno run -A scripts/fuentes/generar-catalogo.ts
 *
 * Criterios de conversión (documentados en core/src/modules/cultivos/MODULE.md):
 *   temperaturaOptimaC = [TOPMN, TOPMX] · temperaturaAbsolutaC = [TMIN, TMAX] · lluviaAnualOptimaMm = [ROPMN, ROPMX]
 *   aguaCicloMm = [RMIN, ROPMN] (modelo EcoCrop: la lluvia se evalúa en la temporada de cultivo)
 *   phOptimo = [PHOPMN, PHOPMX] · cicloDias = [GMIN, GMAX]
 *   toleranciaHelada por la temperatura letal min(KTMP, KTMPR): ≤ −5 °C alta · ≤ −2 °C media · > −2 °C baja · sin dato → sin fuente
 *   toleranciaCalor por TMAX: ≥ 40 °C alta · ≥ 35 °C media · < 35 °C baja
 *   necesidadAgua por ROPMN: ≤ 500 mm baja · ≤ 900 mm media · > 900 mm alta
 *   toleranciaSequia por RMIN: ≤ 300 mm alta · ≤ 500 mm media · > 500 mm baja
 *   texturas por TEXT (heavy → arcillosa, medium → franca, light → arenosa, wide → las tres)
 *   profundidadRaiz por DEP (profundidad de suelo que requiere: shallow → superficial, medium → media, deep → profunda)
 *   valorForrajero: CAT incluye "forage/pasture" → alto; si no → ninguno; CAT vacío → sin fuente
 *   coberturaSuelo: CAT incluye "cover crop" → alta; si no → baja
 *   familias / fijaNitrogeno: FAMNAME (Leguminosae → fabáceas, que fijan nitrógeno)
 *   Asociaciones (dos registros): intersección de los rangos y el valor MENOS tolerante.
 */
import { REGISTROS } from "./extraer-ecocrop.ts";

const URL_ECOCROP = "https://raw.githubusercontent.com/OpenCLIM/ecocrop/main/EcoCrop_DB.csv";

/** Datos descriptivos (no numéricos) que el sistema asigna: nombre común, uso en la rotación, grupo y manejo perenne. */
const DESCRIPTIVOS: Record<string, { nombre: string; uso: string; grupo: string; perenne: boolean }> = {
  maiz: { nombre: "Maíz", uso: "doble_proposito", grupo: "cereal", perenne: false },
  trigo: { nombre: "Trigo", uso: "alimento", grupo: "cereal", perenne: false },
  cebada: { nombre: "Cebada", uso: "doble_proposito", grupo: "cereal", perenne: false },
  avena: { nombre: "Avena", uso: "doble_proposito", grupo: "cereal", perenne: false },
  centeno: { nombre: "Centeno", uso: "doble_proposito", grupo: "cereal", perenne: false },
  arroz: { nombre: "Arroz", uso: "alimento", grupo: "cereal", perenne: false },
  sorgo: { nombre: "Sorgo", uso: "doble_proposito", grupo: "cereal", perenne: false },
  mijo_perla: { nombre: "Mijo perla", uso: "doble_proposito", grupo: "cereal", perenne: false },
  amaranto: { nombre: "Amaranto", uso: "alimento", grupo: "pseudocereal", perenne: false },
  quinua: { nombre: "Quinua", uso: "alimento", grupo: "pseudocereal", perenne: false },
  trigo_sarraceno: { nombre: "Trigo sarraceno", uso: "doble_proposito", grupo: "pseudocereal", perenne: false },
  frijol: { nombre: "Frijol", uso: "alimento", grupo: "leguminosa", perenne: false },
  arveja: { nombre: "Arveja", uso: "alimento", grupo: "leguminosa", perenne: false },
  haba: { nombre: "Haba", uso: "alimento", grupo: "leguminosa", perenne: false },
  garbanzo: { nombre: "Garbanzo", uso: "alimento", grupo: "leguminosa", perenne: false },
  lenteja: { nombre: "Lenteja", uso: "alimento", grupo: "leguminosa", perenne: false },
  soya: { nombre: "Soya", uso: "alimento", grupo: "oleaginosa", perenne: false },
  mani: { nombre: "Maní", uso: "alimento", grupo: "oleaginosa", perenne: false },
  caupi: { nombre: "Caupí (frijol de vaca)", uso: "doble_proposito", grupo: "leguminosa", perenne: false },
  gandul: { nombre: "Gandul (guandú)", uso: "doble_proposito", grupo: "leguminosa", perenne: false },
  tarwi: { nombre: "Tarwi (chocho)", uso: "alimento", grupo: "leguminosa", perenne: false },
  vicia_villosa: { nombre: "Vicia villosa (veza vellosa)", uso: "cobertura", grupo: "cobertura", perenne: false },
  mucuna: { nombre: "Mucuna (frijol terciopelo)", uso: "cobertura", grupo: "cobertura", perenne: false },
  crotalaria: { nombre: "Crotalaria", uso: "cobertura", grupo: "cobertura", perenne: false },
  canavalia: { nombre: "Canavalia", uso: "cobertura", grupo: "cobertura", perenne: false },
  papa: { nombre: "Papa", uso: "alimento", grupo: "tuberculo", perenne: false },
  yuca: { nombre: "Yuca", uso: "alimento", grupo: "tuberculo", perenne: false },
  batata: { nombre: "Batata (camote)", uso: "alimento", grupo: "tuberculo", perenne: false },
  oca: { nombre: "Oca", uso: "alimento", grupo: "tuberculo", perenne: false },
  remolacha: { nombre: "Remolacha", uso: "alimento", grupo: "hortaliza", perenne: false },
  zanahoria: { nombre: "Zanahoria", uso: "alimento", grupo: "hortaliza", perenne: false },
  cebolla_bulbo: { nombre: "Cebolla de bulbo", uso: "alimento", grupo: "hortaliza", perenne: false },
  ajo: { nombre: "Ajo", uso: "alimento", grupo: "hortaliza", perenne: false },
  tomate: { nombre: "Tomate", uso: "alimento", grupo: "hortaliza", perenne: false },
  repollo: { nombre: "Repollo", uso: "alimento", grupo: "hortaliza", perenne: false },
  lechuga: { nombre: "Lechuga", uso: "alimento", grupo: "hortaliza", perenne: false },
  calabaza: { nombre: "Calabaza (ahuyama)", uso: "alimento", grupo: "hortaliza", perenne: false },
  pepino: { nombre: "Pepino", uso: "alimento", grupo: "hortaliza", perenne: false },
  pimiento: { nombre: "Pimentón", uso: "alimento", grupo: "hortaliza", perenne: false },
  girasol: { nombre: "Girasol", uso: "doble_proposito", grupo: "oleaginosa", perenne: false },
  colza: { nombre: "Colza (canola)", uso: "alimento", grupo: "oleaginosa", perenne: false },
  sesamo: { nombre: "Sésamo (ajonjolí)", uso: "alimento", grupo: "oleaginosa", perenne: false },
  algodon: { nombre: "Algodón", uso: "alimento", grupo: "industrial", perenne: false },
  lino: { nombre: "Lino", uso: "doble_proposito", grupo: "oleaginosa", perenne: false },
  alfalfa: { nombre: "Alfalfa", uso: "forraje", grupo: "forraje", perenne: true },
  raigras_trebol: { nombre: "Pradera de raigrás y trébol blanco", uso: "forraje", grupo: "forraje", perenne: true },
  avena_vicia: { nombre: "Avena y vicia forrajera", uso: "forraje", grupo: "forraje", perenne: false },
  sorgo_forrajero: { nombre: "Sorgo forrajero", uso: "forraje", grupo: "forraje", perenne: false },
  mostaza_cobertura: { nombre: "Mostaza de cobertura", uso: "cobertura", grupo: "cobertura", perenne: false },
  rabano_forrajero: { nombre: "Rábano forrajero", uso: "cobertura", grupo: "cobertura", perenne: false },
};

const FAMILIAS: Record<string, string> = {
  Gramineae: "poaceas", Leguminosae: "fabaceas", Solanaceae: "solanaceas", Amaranthaceae: "amarantaceas",
  Chenopodiaceae: "amarantaceas", Polygonaceae: "poligonaceas", Euphorbiaceae: "euforbiaceas", Convolvulaceae: "convolvulaceas",
  Oxalidaceae: "oxalidaceas", Umbelliferae: "apiaceas", Alliaceae: "amarilidaceas", Cruciferae: "brasicaceas",
  Compositae: "asteraceas", Cucurbitaceae: "cucurbitaceas", Pedaliaceae: "pedaliaceas", Malvaceae: "malvaceas", Linaceae: "linaceas",
};

type Fila = Record<string, string>;
const num = (v: string | undefined): number | null => (v === undefined || v === "" || v === "NA" ? null : Number(v));

function leerRegistros(ruta: string): Map<string, Fila[]> {
  const [cab, ...lineas] = Deno.readTextFileSync(ruta).split("\n").filter(Boolean);
  const campos = cab.split("\t");
  const out = new Map<string, Fila[]>();
  for (const l of lineas) {
    const v = l.split("\t");
    const f: Fila = Object.fromEntries(campos.map((c, i) => [c, v[i] ?? ""]));
    out.set(f.clave, [...(out.get(f.clave) ?? []), f]);
  }
  return out;
}

/** Intersección de rangos de varios registros (asociaciones): max de mínimos, min de máximos. */
function rango(fs: Fila[], a: string, b: string): [number, number] | null {
  const mins = fs.map((f) => num(f[a]));
  const maxs = fs.map((f) => num(f[b]));
  if (mins.some((x) => x === null) || maxs.some((x) => x === null)) return null;
  const r: [number, number] = [Math.max(...(mins as number[])), Math.min(...(maxs as number[]))];
  return r[0] <= r[1] ? r : null;
}

function generar() {
  const registros = leerRegistros("../Docs/fuentes/ecocrop_registros.tsv");
  const faostat = JSON.parse(Deno.readTextFileSync("packages/platform/data/faostat-cultivos.json"));
  const mundo = faostat.paises["001"] ?? {};
  const salida: unknown[] = [];

  for (const [clave, codigos] of Object.entries(REGISTROS)) {
    const fs = registros.get(clave)!;
    const d = DESCRIPTIVOS[clave];
    const ref = (campos: string) => "FAO ECOCROP " + codigos.join(" + ") + ": " + campos;
    const fuentesValores: { campo: string; fuente: string; tipo: string; referencia: string }[] = [];
    const sinFuente: string[] = [];
    const usar = <T>(campo: string, valor: T | null, campos: string, tipo = "referencia", respaldo: T): T => {
      if (valor === null) {
        sinFuente.push(campo);
        return respaldo; // marcador: el motor NO lo usa porque está en camposSinFuente
      }
      fuentesValores.push({ campo, fuente: "FAO_ECOCROP", tipo, referencia: ref(campos) });
      return valor;
    };

    const tOpt = usar("temperaturaOptimaC", rango(fs, "TOPMN", "TOPMX"), "TOPMN-TOPMX (°C)", "referencia", [0, 0] as [number, number]);
    const tAbs = usar("temperaturaAbsolutaC", rango(fs, "TMIN", "TMAX"), "TMIN-TMAX (°C)", "referencia", [0, 0] as [number, number]);
    const lluvia = usar("lluviaAnualOptimaMm", rango(fs, "ROPMN", "ROPMX"), "ROPMN-ROPMX (mm)", "referencia", [0, 0] as [number, number]);
    const rmin = Math.max(...fs.map((f) => num(f.RMIN) ?? NaN));
    const ropmn = Math.max(...fs.map((f) => num(f.ROPMN) ?? NaN));
    const agua = usar("aguaCicloMm", Number.isFinite(rmin) && Number.isFinite(ropmn) ? [rmin, Math.max(rmin, ropmn)] as [number, number] : null, "RMIN-ROPMN (mm en la temporada, modelo EcoCrop)", "referencia", [0, 0] as [number, number]);
    const ph = usar("phOptimo", rango(fs, "PHOPMN", "PHOPMX"), "PHOPMN-PHOPMX", "referencia", [6, 7] as [number, number]);
    const gmin = Math.max(...fs.map((f) => num(f.GMIN) ?? NaN));
    const gmax = Math.min(...fs.map((f) => num(f.GMAX) ?? NaN));
    const ciclo = usar("cicloDias", Number.isFinite(gmin) && Number.isFinite(gmax) && gmin > 0 && gmax >= gmin ? [gmin, gmax] as [number, number] : null, "GMIN-GMAX (días)", "referencia", [90, 120] as [number, number]);

    const kt = fs.map((f) => {
      const v = [num(f.KTMP), num(f.KTMPR)].filter((x): x is number => x !== null);
      return v.length ? Math.min(...v) : null;
    });
    const letal = kt.some((x) => x === null) ? null : Math.max(...(kt as number[])); // asociación: la menos tolerante
    const helada = usar("toleranciaHelada", letal === null ? null : letal <= -5 ? "alta" : letal <= -2 ? "media" : "baja", "KTMP/KTMPR (temperatura letal " + letal + " °C)", "calculado", "baja");
    const tmax = tAbs[1];
    const calor = usar("toleranciaCalor", sinFuente.includes("temperaturaAbsolutaC") ? null : tmax >= 40 ? "alta" : tmax >= 35 ? "media" : "baja", "TMAX " + tmax + " °C", "calculado", "baja");
    const necesidad = usar("necesidadAgua", Number.isFinite(ropmn) ? (ropmn <= 500 ? "baja" : ropmn <= 900 ? "media" : "alta") : null, "ROPMN " + ropmn + " mm", "calculado", "media");
    const sequia = usar("toleranciaSequia", Number.isFinite(rmin) ? (rmin <= 300 ? "alta" : rmin <= 500 ? "media" : "baja") : null, "RMIN " + rmin + " mm", "calculado", "media");

    const textos = fs.map((f) => f.TEXT.toLowerCase());
    const tex = (t: string) => {
      const s = new Set<string>();
      if (t.includes("wide")) ["arcillosa", "franca", "arenosa"].forEach((x) => s.add(x));
      if (t.includes("heavy")) s.add("arcillosa");
      if (t.includes("medium")) s.add("franca");
      if (t.includes("light")) s.add("arenosa");
      return s;
    };
    const conjuntos = textos.map(tex);
    const texturasInter = [...conjuntos[0]].filter((x) => conjuntos.every((c) => c.has(x)));
    const texturas = usar("texturas", texturasInter.length ? texturasInter : null, "TEXT (" + textos.join(" / ") + ")", "referencia", ["franca"]);

    const deps = fs.map((f) => f.DEP.toLowerCase());
    const prof = deps.some((x) => x.startsWith("shallow")) ? "superficial" : deps.every((x) => x.startsWith("deep")) ? "profunda" : deps.every((x) => x.startsWith("medium") || x.startsWith("deep")) ? "media" : null;
    const profundidad = usar("profundidadRaiz", prof, "DEP (" + deps.join(" / ") + "; profundidad de suelo que requiere)", "referencia", "media");

    const cats = fs.map((f) => f.CAT.toLowerCase());
    const forraje = usar("valorForrajero", cats.some((c) => c === "") ? null : cats.every((c) => c.includes("forage/pasture")) ? "alto" : "ninguno", "CAT (" + cats.join(" / ") + ")", "referencia", "ninguno");
    const cobertura = usar("coberturaSuelo", cats.some((c) => c === "") ? null : cats.some((c) => c.includes("cover crop")) ? "alta" : "baja", "CAT (" + cats.join(" / ") + ")", "referencia", "baja");

    const familias = [...new Set(fs.map((f) => FAMILIAS[f.FAMNAME.split(":").pop()!.trim()]))];
    if (familias.some((x) => !x)) throw new Error("Familia sin mapear en " + clave + ": " + fs.map((f) => f.FAMNAME).join(" / "));
    fuentesValores.push({ campo: "familias", fuente: "FAO_ECOCROP", tipo: "referencia", referencia: ref("FAMNAME (" + fs.map((f) => f.FAMNAME.split(":").pop()).join(" + ") + ")") });
    const fija = familias.includes("fabaceas");
    fuentesValores.push({ campo: "fijaNitrogeno", fuente: "FAO_ECOCROP", tipo: "calculado", referencia: ref("FAMNAME Leguminosae → fija nitrógeno") });

    const v = mundo[clave];
    const valorProduccionHa = v && v.valorHa !== null
      ? { valor: v.valorHa, unidad: "I$/ha", fuente: "FAOSTAT", tipo: "referencia", fecha: faostat.periodo, nota: "Valor bruto de la producción por hectárea, promedio mundial (I$ constantes 2014-2016); no descuenta costos. Ítems FAOSTAT " + v.items.join(", ") + "." }
      : { valor: null, unidad: "I$/ha", fuente: "FAOSTAT", tipo: "referencia", fecha: faostat.periodo, nota: "Sin datos de FAOSTAT para este cultivo." };
    if (valorProduccionHa.valor === null) sinFuente.push("valorProduccionHa");

    const lispa = fs.map((f) => f.LISPA || "sin dato").join(" / ");
    salida.push({
      clave,
      nombre: d.nombre,
      nombreCientifico: fs.map((f) => f.ScientificName).join(" + "),
      familias,
      uso: d.uso,
      grupo: d.grupo,
      perenne: d.perenne,
      cicloDias: ciclo,
      ocupaVariasTemporadas: (ciclo[0] + ciclo[1]) / 2 > 180,
      temperaturaOptimaC: tOpt,
      temperaturaAbsolutaC: tAbs,
      lluviaAnualOptimaMm: lluvia,
      aguaCicloMm: agua,
      toleranciaHelada: helada,
      toleranciaCalor: calor,
      toleranciaSequia: sequia,
      necesidadAgua: necesidad,
      phOptimo: ph,
      texturas,
      profundidadRaiz: profundidad,
      fijaNitrogeno: fija,
      coberturaSuelo: cobertura,
      valorForrajero: forraje,
      notas: ["Ciclo de vida según ECOCROP: " + lispa + "."],
      fuentes: ["FAO ECOCROP (EcoPortCode " + codigos.join(", ") + "), " + URL_ECOCROP, "FAOSTAT " + faostat.periodo + " (valor bruto de la producción)"],
      ecocrop: { codigos, url: URL_ECOCROP },
      fuentesValores,
      camposSinFuente: sinFuente,
      valorProduccionHa,
    });
  }
  return salida;
}

const cultivos = generar();
const cuerpo = `/**
 * Catálogo de cultivos GENERADO por scripts/fuentes/generar-catalogo.ts. NO EDITAR A MANO.
 *
 * Cada valor numérico sale de FAO ECOCROP (registro por EcoPortCode) o de FAOSTAT; \`fuentesValores\` dice de dónde
 * sale cada campo y \`camposSinFuente\` lista lo que la fuente no trae (el motor no lo usa para decidir).
 * La facelia (Phacelia tanacetifolia) no está en ECOCROP: quedó fuera del catálogo de decisión (ver CULTIVOS_SIN_FUENTE).
 */
import type { CrearCultivoDatos } from "@agrocore/core";

/** Cultivos que no se pudieron respaldar con una fuente y por eso no se usan. */
export const CULTIVOS_SIN_FUENTE: readonly { clave: string; nombre: string; motivo: string }[] = [
  { clave: "facelia", nombre: "Facelia", motivo: "Phacelia tanacetifolia no está en la base FAO ECOCROP." },
];

export const CATALOGO_CULTIVOS: readonly CrearCultivoDatos[] = ${JSON.stringify(cultivos, null, 1).replace(/\n\s*/g, " ")} as unknown as CrearCultivoDatos[];
`;
await Deno.writeTextFile("packages/database/src/catalogos/catalogo-cultivos.datos.ts", cuerpo.replace(/\}, \{ "clave"/g, "},\n  { \"clave\""));
const sinFuente = (cultivos as { clave: string; camposSinFuente: string[] }[]).filter((c) => c.camposSinFuente.length);
console.log("Cultivos: " + cultivos.length + " · con campos sin fuente: " + sinFuente.map((c) => c.clave + "[" + c.camposSinFuente.join(",") + "]").join(" "));
