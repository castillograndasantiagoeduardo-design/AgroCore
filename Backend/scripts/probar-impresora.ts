/**
 * Prueba de la impresora térmica (Xprinter 58 mm compartida en Windows): imprime una línea con tildes y ñ para
 * validar la página de códigos (ESC t n).
 *
 * Uso (desde Backend/):  deno run -A --env-file=../.env scripts/probar-impresora.ts
 *   Variables opcionales en .env: IMPRESORA_COMPARTIDA (por defecto XP58), IMPRESORA_CODEPAGE (por defecto 2 = PC850),
 *   IMPRESORA_CORTADOR (true/false).
 *
 * Códigos de salida: 0 = impreso · 2 = IMPRESORA_NO_DISPONIBLE (controlado: compartir/encender la impresora) · 1 = error inesperado.
 * Si las tildes salen mal, cambia IMPRESORA_CODEPAGE según la hoja de autoprueba (apagar, mantener FEED, encender).
 */
import { EscPosWindowsPrinter } from "@agrocore/platform";

const impresoraCompartida = Deno.env.get("IMPRESORA_COMPARTIDA") || "XP58";
const codepage = Number(Deno.env.get("IMPRESORA_CODEPAGE") ?? "2");
const cortar = (Deno.env.get("IMPRESORA_CORTADOR") ?? "false").toLowerCase() === "true";

const impresora = new EscPosWindowsPrinter({ impresoraCompartida, codepage, cortar });
console.log("Imprimiendo prueba en " + impresora.destino + " (ESC t " + codepage + ")…");

const r = await impresora.imprimir([
  { texto: "AGROCORE", estilo: "titulo" },
  { texto: "Prueba de impresora", estilo: "centrado" },
  { texto: "-".repeat(32), estilo: "separador" },
  { texto: "áéíóú ñ Ñ ¿? ¡! 25°C", estilo: "negrita" },
  { texto: "ÁÉÍÓÚ Ü ü", estilo: "normal" },
  { texto: "Página de códigos: ESC t " + codepage, estilo: "normal" },
  { texto: "Si ves símbolos raros, cambia", estilo: "normal" },
  { texto: "IMPRESORA_CODEPAGE (ej. 19).", estilo: "normal" },
]);

if (r.ok) {
  console.log("✅ ok: ticket enviado a " + r.value.impresora + ". Revisa con los ojos que las tildes y la ñ salgan bien.");
  Deno.exit(0);
}
console.log("RESULTADO: " + r.error.code + " (controlado, sin excepción)");
console.log(r.error.message);
console.log(
  "Paso humano: Panel de control → Dispositivos e impresoras → XP-58 → Propiedades de impresora → Compartir → nombre «" +
    impresoraCompartida + "»; encenderla y ponerle papel.",
);
Deno.exit(r.error.code === "IMPRESORA_NO_DISPONIBLE" ? 2 : 1);
