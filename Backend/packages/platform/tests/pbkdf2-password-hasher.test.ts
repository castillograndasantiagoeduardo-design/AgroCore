import { assertEquals, assert } from "jsr:@std/assert";
import { Pbkdf2PasswordHasher } from "../src/pbkdf2-password-hasher.ts";

Deno.test("Pbkdf2PasswordHasher genera un hash con prefijo pbkdf2 y salt", async () => {
  const hasher = new Pbkdf2PasswordHasher(10_000);
  const hash = await hasher.hash("test_password_123");

  assert(hash.startsWith("pbkdf2$10000$"));
  const partes = hash.split("$");
  assertEquals(partes.length, 4);
});

Deno.test("Pbkdf2PasswordHasher verifica contraseña correcta y rechaza incorrecta", async () => {
  const hasher = new Pbkdf2PasswordHasher(10_000);
  const hash = await hasher.hash("clave_correcta");

  const esValido = await hasher.comparar("clave_correcta", hash);
  const esInvalido = await hasher.comparar("clave_erronea", hash);

  assertEquals(esValido, true);
  assertEquals(esInvalido, false);
});

Deno.test("Pbkdf2PasswordHasher maneja formato corrupto retornando false sin lanzar excepción", async () => {
  const hasher = new Pbkdf2PasswordHasher(10_000);
  const resultado = await hasher.comparar("clave", "formato_invalido");
  assertEquals(resultado, false);
});

