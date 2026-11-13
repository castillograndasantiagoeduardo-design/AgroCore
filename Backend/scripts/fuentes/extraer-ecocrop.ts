/**
 * Extrae de la base FAO ECOCROP (CSV completo) los registros que usa el catálogo de AgroCore.
 *
 * Fuente: FAO ECOCROP, copia pública del proyecto OpenCLIM:
 *   https://raw.githubusercontent.com/OpenCLIM/ecocrop/main/EcoCrop_DB.csv
 *   (SHA-256 del archivo usado el 2026-11-13: 4187e8846336e185c4583165211c5981855e95adfbefd897bd2bd481de48d106)
 *
 * Uso (desde Backend/):
 *   deno run -A scripts/fuentes/extraer-ecocrop.ts <ruta EcoCrop_DB.csv> ../Docs/fuentes/ecocrop_registros.tsv
 */
import { parse } from "jsr:@std/csv@1.0.6";

/** EcoPortCode elegido para cada clave (una asociación usa dos registros). */
export const REGISTROS: Record<string, number[]> = {
  maiz: [238663], trigo: [2114], cebada: [1232], avena: [481], centeno: [1929], arroz: [1574], sorgo: [48747], mijo_perla: [8418],
  amaranto: [2187], quinua: [2509], trigo_sarraceno: [2285], frijol: [1668], arveja: [1721], haba: [2146], garbanzo: [2479],
  lenteja: [7209], soya: [1150], mani: [2199], caupi: [2153], gandul: [576], tarwi: [7435], vicia_villosa: [238009], mucuna: [7832],
  crotalaria: [801], canavalia: [609], papa: [1971], yuca: [1420], batata: [1265], oca: [2371], remolacha: [514], zanahoria: [871],
  cebolla_bulbo: [364], ajo: [367], tomate: [1379], repollo: [554], lechuga: [1313], calabaza: [819], pepino: [817], pimiento: [618],
  girasol: [1191], colza: [549], sesamo: [1937], algodon: [1160], lino: [7336], alfalfa: [1428], raigras_trebol: [1362, 2105],
  avena_vicia: [481, 238003], sorgo_forrajero: [48747], mostaza_cobertura: [9787], rabano_forrajero: [83541],
};

const CAMPOS = ["EcoPortCode", "ScientificName", "FAMNAME", "LIFO", "LISPA", "CAT", "TOPMN", "TOPMX", "TMIN", "TMAX", "ROPMN", "ROPMX", "RMIN", "RMAX", "PHOPMN", "PHOPMX", "DEP", "TEXT", "KTMPR", "KTMP", "GMIN", "GMAX"];

if (import.meta.main) {
  const [entrada, salida] = Deno.args;
  const texto = new TextDecoder("latin1").decode(await Deno.readFile(entrada));
  const filas = parse(texto, { skipFirstRow: true }) as Record<string, string>[];
  const porCodigo = new Map(filas.map((f) => [Number(f.EcoPortCode), f]));
  const lineas = [["clave", ...CAMPOS].join("\t")];
  for (const [clave, codigos] of Object.entries(REGISTROS)) {
    for (const codigo of codigos) {
      const f = porCodigo.get(codigo);
      if (!f) throw new Error("EcoPortCode " + codigo + " no está en el CSV");
      lineas.push([clave, ...CAMPOS.map((c) => (f[c] ?? "").replace(/\s+/g, " ").trim())].join("\t"));
    }
  }
  await Deno.writeTextFile(salida, lineas.join("\n") + "\n");
  console.log("Registros escritos: " + (lineas.length - 1) + " → " + salida);
}
