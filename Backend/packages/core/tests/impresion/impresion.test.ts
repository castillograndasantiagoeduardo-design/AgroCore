/**
 * Tests del módulo impresion: composición del ticket de 58 mm (32 caracteres) con la recomendación por época y
 * caso de uso con impresora falsa. La recomendación se genera con el caso de uso real y proveedores falsos (sin red).
 */
import { assert, assertEquals } from "@std/assert";
import { ANCHO_TICKET_58MM, type RecomendacionRapidaDto } from "@agrocore/contracts";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import {
  AVISO_TICKET,
  componerTicketRecomendacion,
  type ContextoSolicitud,
  cortarTexto,
  formatearFechaTicket,
  ImpresoraNoDisponibleError,
  ImprimirTicketTerrenoUseCase,
  RecomendarPorEpocaUseCase,
} from "../../src/index.ts";
import { MESES_DUITAMA, perfilSintetico, PRESENCIA_DUITAMA, repoCultivos } from "../recomendacion/_fixtures.ts";

const contexto: ContextoSolicitud = { origen: "script", ip: null };
const temporizador = { esperar: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(1, Math.round(ms / 500)))) };
const reloj = { hoy: () => new Date("2026-11-12T14:05:00Z") };

async function recomendacion(carretera = false) {
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const via = carretera ? [{ tipo: "primary", nombre: "Ruta 55", geometria: [[5.785, -73.031], [5.785, -73.029]] as [number, number][] }] : [];
  return new RecomendarPorEpocaUseCase({
    vias: { obtenerElementos: () => Promise.resolve(Result.ok({ vias: via, edificaciones: [], aguaPoligonos: [], aguaLineas: [], fuente: "OpenStreetMap" })) },
    cobertura: { obtenerCobertura: () => Promise.resolve(Result.ok({ claseIgbp: 12, anio: 2023, fuente: "MODIS MCD12Q1" })) },
    elevacion: { obtenerElevaciones: () => Promise.resolve(Result.ok({ fuente: "SRTM", elevacionesM: [2530] })) },
    clima: { porUbicacionRapida: () => Promise.resolve(Result.ok({ perfil, origen: "serie_diaria" as const })) },
    presencia: { obtenerPresencia: () => Promise.resolve(Result.ok(PRESENCIA_DUITAMA)) },
    cultivos: repoCultivos(),
    temporizador,
    reloj,
  });
}

const entrada = {
  area: { tipo: "punto" as const, latitud: 5.785, longitud: -73.03 },
  cultivoActual: "papa",
  tieneRiego: false,
  objetivo: "equilibrado" as const,
  soloVistaPrevia: false,
};

async function rapida(carretera = false): Promise<RecomendacionRapidaDto> {
  const r = await (await recomendacion(carretera)).execute(entrada, contexto);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

Deno.test("ticket: ninguna línea supera los 32 caracteres y lleva el aviso, las épocas y las fuentes", async () => {
  const lineas = componerTicketRecomendacion({ nombre: "La Esperanza", fecha: "12 nov 2026 14:05 UTC", rapida: await rapida(), objetivo: "equilibrado", ancho: ANCHO_TICKET_58MM });
  assert(lineas.every((l) => l.texto.length <= 32), lineas.filter((l) => l.texto.length > 32).map((l) => l.texto).join(" | "));
  assertEquals(lineas[0], { texto: "AGROCORE", estilo: "titulo" });
  const texto = lineas.map((l) => l.texto).join(" ").replace(/\s+/g, " ");
  assert(texto.includes("Herramienta de apoyo."));
  assert(texto.includes("ÉPOCAS"));
  assert(texto.includes("Lluvias de"), texto);
  assert(texto.includes("Fuentes:") && texto.includes("NASA POWER"));
});

Deno.test("ticket: un sitio sobre la carretera imprime el aviso y ningún cultivo", async () => {
  const lineas = componerTicketRecomendacion({ nombre: null, fecha: "x", rapida: await rapida(true), objetivo: "equilibrado", ancho: 32 });
  const texto = lineas.map((l) => l.texto).join(" ");
  assert(texto.includes("No se puede sembrar: es carretera"), texto);
  assert(texto.includes("Sin cultivos"));
  assert(!texto.includes("ÉPOCAS"));
});

Deno.test("cortarTexto y fecha del ticket", () => {
  assertEquals(cortarTexto("uno dos tres cuatro", 9), ["uno dos", "tres", "cuatro"]);
  assertEquals(cortarTexto("supercalifragilistico", 8), ["supercal", "ifragili", "stico"]);
  assertEquals(formatearFechaTicket(new Date("2026-11-12T14:05:00Z")), "12 nov 2026 14:05 UTC");
  assert(AVISO_TICKET.length <= 64);
});

async function caso(impresoraOk: boolean, carretera = false) {
  let impresas = 0;
  const uc = new ImprimirTicketTerrenoUseCase(
    await recomendacion(carretera),
    {
      imprimir: () => {
        impresas++;
        return Promise.resolve(
          impresoraOk ? Result.ok({ impresora: "\\\\localhost\\XP58" }) : Result.err(new ImpresoraNoDisponibleError("XP58", "no compartida") as DomainError),
        );
      },
    },
    reloj,
  );
  return { uc, impresas: () => impresas };
}

Deno.test("imprimir: con impresora disponible imprime y devuelve las líneas", async () => {
  const { uc, impresas } = await caso(true);
  const r = await uc.execute(entrada, contexto);
  assert(r.ok && r.value.impreso);
  assertEquals(impresas(), 1);
});

Deno.test("imprimir: impresora no disponible → IMPRESORA_NO_DISPONIBLE (sin excepción)", async () => {
  const r = await (await caso(false)).uc.execute(entrada, contexto);
  assertEquals(!r.ok && r.error.code, "IMPRESORA_NO_DISPONIBLE");
});

Deno.test("imprimir: la vista previa no toca la impresora; en carretera compone igual el ticket", async () => {
  const { uc, impresas } = await caso(false, true);
  const r = await uc.execute({ ...entrada, soloVistaPrevia: true }, contexto);
  assert(r.ok && !r.value.impreso);
  assertEquals(impresas(), 0);
});
