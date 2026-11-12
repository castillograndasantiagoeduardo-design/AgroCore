/**
 * Pbkdf2PasswordHasher: implementa IPasswordHasher usando la API estándar Web Crypto (PBKDF2 + SHA-256).
 * No lee Deno.env: los parámetros se reciben por constructor o usan valores por defecto seguros.
 */
import type { IPasswordHasher } from "@duitamacrece/core";

export class Pbkdf2PasswordHasher implements IPasswordHasher {
  private readonly iteraciones: number;
  private readonly longitudClave: number;

  constructor(iteraciones = 100_000, longitudClave = 32) {
    this.iteraciones = iteraciones;
    this.longitudClave = longitudClave;
  }

  async hash(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derived = await this.derivarClave(password, salt, this.iteraciones, this.longitudClave);
    const saltHex = this.toHex(salt);
    const derivedHex = this.toHex(derived);
    return `pbkdf2$${this.iteraciones}$${saltHex}$${derivedHex}`;
  }

  async comparar(password: string, hashAlmacenado: string): Promise<boolean> {
    try {
      const partes = hashAlmacenado.split("$");
      if (partes.length !== 4 || partes[0] !== "pbkdf2") {
        return false;
      }
      const iteraciones = Number.parseInt(partes[1], 10);
      if (Number.isNaN(iteraciones) || iteraciones <= 0) {
        return false;
      }
      const salt = this.fromHex(partes[2]);
      const esperado = this.fromHex(partes[3]);
      const obtenido = await this.derivarClave(password, salt, iteraciones, esperado.length);
      return this.timingSafeEqual(esperado, obtenido);
    } catch {
      return false;
    }
  }

  private async derivarClave(
    password: string,
    salt: Uint8Array,
    iteraciones: number,
    length: number,
  ): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password) as unknown as BufferSource,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as unknown as BufferSource,
        iterations: iteraciones,
        hash: "SHA-256",
      },
      keyMaterial,
      length * 8,
    );
    return new Uint8Array(derivedBits);
  }

  private toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private fromHex(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new Error("Longitud hexadecimal inválida");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  private timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff === 0;
  }
}
