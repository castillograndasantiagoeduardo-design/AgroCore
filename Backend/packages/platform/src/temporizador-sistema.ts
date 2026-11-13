/**
 * TemporizadorSistema: implementa ITemporizador con setTimeout.
 * Usa Deno.unrefTimer para que una espera pendiente no impida que el proceso termine.
 */
import type { ITemporizador } from "@agrocore/core";

export class TemporizadorSistema implements ITemporizador {
  esperar(ms: number): Promise<void> {
    return new Promise((resolver) => {
      const id = setTimeout(resolver, ms);
      Deno.unrefTimer(id);
    });
  }
}
