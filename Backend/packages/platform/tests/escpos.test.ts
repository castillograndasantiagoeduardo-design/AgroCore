/**
 * Tests del adaptador ESC/POS sin impresora: codificación CP850, bytes de control y manejo de fallos.
 */
import { assert, assertEquals } from "@std/assert";
import { codificarCp850, construirBytesEscPos, EscPosWindowsPrinter } from "../src/escpos-windows-printer.ts";

Deno.test("CP850: tildes, ñ, signos de apertura y grados", () => {
  assertEquals([...codificarCp850("áéíóú ñ Ñ")], [0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0x20, 0xa4, 0x20, 0xa5]);
  assertEquals([...codificarCp850("¿¡°")], [0xa8, 0xad, 0xf8]);
  assertEquals(new TextDecoder().decode(codificarCp850("a–b → c")), "a-b > c");
  assertEquals([...codificarCp850("ã")], [0x61]); // sin equivalente: se quita la tilde
});

Deno.test("ESC/POS: inicializa, fija la página de códigos, negrita y título doble", () => {
  const bytes = construirBytesEscPos([{ texto: "AGROCORE", estilo: "titulo" }, { texto: "año", estilo: "normal" }], { codepage: 2, cortar: true });
  assertEquals([...bytes.slice(0, 5)], [0x1b, 0x40, 0x1b, 0x74, 2]);
  const s = [...bytes];
  const contiene = (sec: number[]) => s.some((_, i) => sec.every((b, j) => s[i + j] === b));
  assert(contiene([0x1b, 0x45, 1]), "negrita");
  assert(contiene([0x1d, 0x21, 0x11]), "doble ancho y alto");
  assert(contiene([0x61, 0xa4, 0x6f]), "'año' en CP850");
  assert(contiene([0x1d, 0x56, 66, 0]), "corte");
});

Deno.test("impresora: fuera de Windows responde IMPRESORA_NO_DISPONIBLE sin lanzar", async () => {
  const r = await new EscPosWindowsPrinter({ sistemaOperativo: "linux" }).imprimir([{ texto: "x", estilo: "normal" }]);
  assertEquals(!r.ok && r.error.code, "IMPRESORA_NO_DISPONIBLE");
});

Deno.test("impresora: copy /b fallido → IMPRESORA_NO_DISPONIBLE; exitoso → ok con el destino", async () => {
  const falla = new EscPosWindowsPrinter({
    sistemaOperativo: "windows",
    escribirTemporal: () => Promise.resolve("ticket-de-prueba.bin"),
    ejecutar: () => Promise.resolve({ codigo: 1, salida: "El sistema no puede encontrar la ruta especificada." }),
  });
  const r1 = await falla.imprimir([{ texto: "x", estilo: "normal" }]);
  assertEquals(!r1.ok && r1.error.code, "IMPRESORA_NO_DISPONIBLE");

  let destino = "";
  const bien = new EscPosWindowsPrinter({
    sistemaOperativo: "windows",
    escribirTemporal: () => Promise.resolve("ticket-de-prueba.bin"),
    impresoraCompartida: "XP58",
    ejecutar: (_a, d) => {
      destino = d;
      return Promise.resolve({ codigo: 0, salida: "        1 archivo(s) copiado(s)." });
    },
  });
  const r2 = await bien.imprimir([{ texto: "x", estilo: "normal" }]);
  assert(r2.ok);
  assertEquals(destino, "\\\\localhost\\XP58");
});
