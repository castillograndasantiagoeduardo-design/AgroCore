/**
 * Tests del módulo impresion: composición del ticket (32 caracteres) y caso de uso con impresora falsa.
 */
import { assert, assertEquals } from "@std/assert";
import { ANCHO_TICKET_58MM, type ComparacionRotacionesDto, type PerfilTerrenoDto } from "@agrocore/contracts";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import {
  type AreaSeleccionada,
  AVISO_TICKET,
  componerTicketTerreno,
  type ContextoSolicitud,
  cortarTexto,
  formatearFechaTicket,
  ImpresoraNoDisponibleError,
  ImprimirTicketTerrenoUseCase,
} from "../../src/index.ts";

const contexto: ContextoSolicitud = { origen: "script", ip: null };

function terreno(aptitud: PerfilTerrenoDto["aptitud"] = "apto"): PerfilTerrenoDto {
  return {
    ubicacion: { tipo: "punto", latitud: 5.785, longitud: -73.03, areaHa: null, hemisferio: "norte" },
    aptitud,
    mensajeAptitud: aptitud === "apto" ? "Apto para sembrar" : "No se puede sembrar: es carretera",
    afectacion: { carreteraPct: 0, edificacionPct: 0, aguaPct: 0, excluidoPct: 0, puntosMuestreados: 1 },
    viasCercanas: [], elevacionM: 2481, pendientePct: 3.7, suelo: null, humedadSuelo: null, ndvi: null,
    cobertura: { claseIgbp: 10, nombre: "Pastizal", categoria: "pastizal", anio: 2024, fuente: "MODIS" },
    fuentes: ["NASA MODIS MCD12Q1 v061 (IGBP, 500 m, ORNL DAAC)", "NASA SRTM 30 m (vía OpenTopoData)"],
    vaciosInformacion: [], advertencias: [],
  };
}

const comparacionFalsa = {
  sitio: { clasificacionClimatica: "de_altura" },
  clima: { lluviaAnualMm: 880.2 },
  terreno: { mesesBaldios: [1, 2] },
  calendario: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, vulnerabilidad: { severidadMaxima: i === 0 ? "alta" : null } })),
  estrategias: ["A", "B", "C"].map((id, i) => ({
    id, nombre: ["Rotación actual", "Mejor para el suelo", "Mejor para forraje e ingreso"][i], puntajeTotal: 30 + i * 20,
    secuencia: [{ cultivoNombre: "Papa", continua: false }, { cultivoNombre: "Haba", continua: false }],
  })),
  estrategiaMejorPuntuada: "C",
  oportunidades: [{ texto: "En Enero, Febrero el lote suele estar baldío (NDVI) → sembrar Vicia como cobertura." }],
} as unknown as ComparacionRotacionesDto;

Deno.test("ticket: ninguna línea supera los 32 caracteres y lleva el aviso y las estrategias", () => {
  const lineas = componerTicketTerreno({ nombre: "La Esperanza", fecha: "12 nov 2026 14:05 UTC", terreno: terreno(), comparacion: comparacionFalsa, ancho: ANCHO_TICKET_58MM });
  assert(lineas.every((l) => l.texto.length <= 32), lineas.filter((l) => l.texto.length > 32).map((l) => l.texto).join(" | "));
  assertEquals(lineas[0], { texto: "AGROCORE", estilo: "titulo" });
  const texto = lineas.map((l) => l.texto).join("\n");
  assert(texto.includes("Herramienta de apoyo."));
  assert(texto.includes("*C Mejor para forraje"));
  assert(texto.includes("Baldío"));
  assert(texto.includes("Ene,Feb"));
});

Deno.test("ticket: un sitio sobre la carretera imprime el aviso y ninguna rotación", () => {
  const lineas = componerTicketTerreno({ nombre: null, fecha: "x", terreno: terreno("no_apto_carretera"), comparacion: null, ancho: 32 });
  const texto = lineas.map((l) => l.texto).join(" ");
  assert(texto.includes("No se puede sembrar: es carretera"));
  assert(texto.includes("Sin rotaciones"));
  assert(!texto.includes("ESTRATEGIAS"));
});

Deno.test("cortarTexto y fecha del ticket", () => {
  assertEquals(cortarTexto("uno dos tres cuatro", 9), ["uno dos", "tres", "cuatro"]);
  assertEquals(cortarTexto("supercalifragilistico", 8), ["supercal", "ifragili", "stico"]);
  assertEquals(formatearFechaTicket(new Date("2026-11-12T14:05:00Z")), "12 nov 2026 14:05 UTC");
  assert(AVISO_TICKET.length <= 64);
});

function caso(impresoraOk: boolean, apto = true) {
  let impresas = 0;
  const uc = new ImprimirTicketTerrenoUseCase(
    { analizar: (_a: AreaSeleccionada) => Promise.resolve(terreno(apto ? "apto" : "no_apto_carretera")) },
    { execute: () => Promise.resolve(Result.ok(comparacionFalsa)) },
    {
      imprimir: () => {
        impresas++;
        return Promise.resolve(
          impresoraOk
            ? Result.ok({ impresora: "\\\\localhost\\XP58" })
            : Result.err(new ImpresoraNoDisponibleError("XP58", "no compartida") as DomainError),
        );
      },
    },
    { hoy: () => new Date("2026-11-12T14:05:00Z") },
  );
  return { uc, impresas: () => impresas };
}
const entrada = {
  area: { tipo: "punto" as const, latitud: 5.785, longitud: -73.03 },
  cultivoActual: "papa",
  tieneRiego: false,
  prioridades: { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 },
  soloVistaPrevia: false,
};

Deno.test("imprimir: con impresora disponible imprime y devuelve las líneas", async () => {
  const { uc, impresas } = caso(true);
  const r = await uc.execute(entrada, contexto);
  assert(r.ok && r.value.impreso);
  assertEquals(impresas(), 1);
});

Deno.test("imprimir: impresora no disponible → IMPRESORA_NO_DISPONIBLE (sin excepción)", async () => {
  const r = await caso(false).uc.execute(entrada, contexto);
  assertEquals(!r.ok && r.error.code, "IMPRESORA_NO_DISPONIBLE");
});

Deno.test("imprimir: la vista previa no toca la impresora; en carretera compone igual el ticket", async () => {
  const { uc, impresas } = caso(false, false);
  const r = await uc.execute({ ...entrada, soloVistaPrevia: true }, contexto);
  assert(r.ok && !r.value.impreso);
  assertEquals(impresas(), 0);
});
