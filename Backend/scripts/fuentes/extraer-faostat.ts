/**
 * Resume FAOSTAT por país para los cultivos del catálogo: área cosechada (ha) y valor bruto de la producción por hectárea.
 *
 * Fuentes (descarga masiva oficial de FAOSTAT):
 *   https://bulks-faostat.fao.org/production/Value_of_Production_E_All_Data_(Normalized).zip   elemento 152, I$ constantes 2014-2016
 *   https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip  elemento 5312, área cosechada
 * Periodo: 2018-2022 (promedio; valor por ha = suma de valor / suma de área en los años con ambos datos).
 *
 * Entrada: dos TSV filtrados (area_code, m49, item_code, item, año, valor) con el elemento y los años de arriba.
 * Uso (desde Backend/):
 *   deno run -A scripts/fuentes/extraer-faostat.ts <vop_paises.tsv> <area_paises.tsv> packages/platform/data/faostat-cultivos.json
 */

/** Ítems de FAOSTAT por cultivo. Para la presencia se suman todos; el valor por ha se toma del de mayor área. */
export const ITEMS_FAOSTAT: Record<string, number[]> = {
  maiz: [56, 446], trigo: [15], cebada: [44], avena: [75], centeno: [71], arroz: [27], sorgo: [83], mijo_perla: [79], quinua: [92],
  trigo_sarraceno: [89], frijol: [176, 414], arveja: [187, 417], haba: [181, 420], garbanzo: [191], lenteja: [201], soya: [236],
  mani: [242], caupi: [195], gandul: [197], tarwi: [210], papa: [116], yuca: [125], batata: [122], zanahoria: [426],
  cebolla_bulbo: [403], ajo: [406], tomate: [388], repollo: [358], lechuga: [372], calabaza: [394], pepino: [397], pimiento: [401],
  girasol: [267], colza: [270], sesamo: [289], algodon: [328], lino: [333],
};

interface Fila {
  m49: string;
  item: number;
  anio: number;
  valor: number;
}

function leer(ruta: string): Fila[] {
  return Deno.readTextFileSync(ruta).split("\n").filter(Boolean).map((l) => {
    const [, m49, item, , anio, valor] = l.split("\t");
    return { m49: m49.replace(/^'/, ""), item: Number(item), anio: Number(anio), valor: Number(valor) };
  });
}

if (import.meta.main) {
  const [vop, area, salida] = Deno.args;
  const valores = new Map<string, number>();
  for (const f of leer(vop)) valores.set(f.m49 + "|" + f.item + "|" + f.anio, f.valor * 1000);
  const acumulado = new Map<string, { areaHa: number; valor: number; areaConValor: number; anios: Set<number> }>();
  for (const f of leer(area)) {
    if (!(f.valor > 0)) continue;
    const k = f.m49 + "|" + f.item;
    const a = acumulado.get(k) ?? { areaHa: 0, valor: 0, areaConValor: 0, anios: new Set<number>() };
    a.areaHa += f.valor;
    a.anios.add(f.anio);
    const v = valores.get(f.m49 + "|" + f.item + "|" + f.anio);
    if (v !== undefined) {
      a.valor += v;
      a.areaConValor += f.valor;
    }
    acumulado.set(k, a);
  }
  const paises: Record<string, Record<string, { areaHa: number; valorHa: number | null; items: number[] }>> = {};
  const m49s = new Set([...acumulado.keys()].map((k) => k.split("|")[0]));
  for (const m49 of m49s) {
    const cultivos: Record<string, { areaHa: number; valorHa: number | null; items: number[] }> = {};
    for (const [clave, items] of Object.entries(ITEMS_FAOSTAT)) {
      const presentes = items.map((i) => ({ i, a: acumulado.get(m49 + "|" + i) })).filter((x) => x.a);
      if (!presentes.length) continue;
      const areaPromedio = presentes.reduce((s, x) => s + x.a!.areaHa / x.a!.anios.size, 0);
      const mayor = presentes.sort((a, b) => b.a!.areaHa - a.a!.areaHa)[0].a!;
      cultivos[clave] = {
        areaHa: Math.round(areaPromedio),
        valorHa: mayor.areaConValor > 0 ? Math.round(mayor.valor / mayor.areaConValor) : null,
        items: presentes.map((x) => x.i),
      };
    }
    if (Object.keys(cultivos).length) paises[m49] = cultivos;
  }
  const json = {
    fuente: "FAOSTAT (QCL elemento 5312 área cosechada; QV elemento 152 valor bruto de la producción, I$ constantes 2014-2016)",
    url: "https://www.fao.org/faostat/en/#data/QCL",
    periodo: "2018-2022",
    nota: "areaHa = área cosechada promedio anual; valorHa = valor bruto de la producción por hectárea (no descuenta costos). Clave de país = código M49 (ISO 3166-1 numérico; 001 = mundo).",
    paises,
  };
  await Deno.writeTextFile(salida, JSON.stringify(json));
  console.log("Países: " + Object.keys(paises).length + " · mundo: " + JSON.stringify(paises["001"] ? Object.keys(paises["001"]).length : 0) + " cultivos → " + salida);
}
