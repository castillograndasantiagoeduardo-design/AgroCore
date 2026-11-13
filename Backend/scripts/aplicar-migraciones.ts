/**
 * Aplica en orden los archivos de Docs/migraciones/*.sql que aún no se aplicaron y registra cada uno
 * en la tabla `migraciones_aplicadas`.
 *
 * Uso (desde Backend/):  deno run -A --env-file=../.env scripts/aplicar-migraciones.ts
 *
 * - Usa la base que diga .env (DB_NAME). Si no existe, intenta crearla.
 * - Idempotente: una migración registrada no se vuelve a correr. Dentro de una migración, los errores de
 *   "ya existe" (tabla, columna, índice, trigger) o de una columna ya renombrada se toman como
 *   "ya aplicado" y se informan como aviso, para poder partir de bases creadas con versiones anteriores.
 * - No destructivo: no ejecuta DROP (los DROP de las migraciones van comentados).
 * - Nunca imprime los valores de .env (ni contraseña, ni usuario, ni nombre de la base).
 */
import mysql from "mysql2/promise";

/** Códigos MySQL que significan "esto ya estaba aplicado". */
const YA_APLICADO: Record<number, string> = {
  1050: "la tabla ya existe",
  1060: "la columna ya existe",
  1061: "el índice ya existe",
  1091: "no hay nada que quitar",
  1359: "el trigger ya existe",
  1826: "la llave foránea ya existe",
};
/** 1054 (columna desconocida) solo se tolera en un RENAME COLUMN: significa que ya se renombró. */
const COLUMNA_DESCONOCIDA = 1054;

function requerida(clave: string): string {
  const valor = Deno.env.get(clave);
  if (!valor) {
    console.error("❌ Falta la variable " + clave + " en .env. Agrégala y vuelve a ejecutar.");
    Deno.exit(1);
  }
  return valor;
}

/** Divide un archivo SQL en sentencias, respetando DELIMITER (para triggers) y quitando comentarios y USE. */
export function dividirSentencias(sql: string): string[] {
  const sentencias: string[] = [];
  let delimitador = ";";
  let actual: string[] = [];
  for (const lineaCruda of sql.split(/\r?\n/)) {
    const linea = lineaCruda.trimEnd();
    const limpia = linea.trim();
    const cambio = limpia.match(/^DELIMITER\s+(\S+)$/i);
    if (cambio) {
      delimitador = cambio[1];
      continue;
    }
    if (actual.length === 0 && (limpia === "" || limpia.startsWith("--"))) continue;
    if (limpia.startsWith("--")) continue;
    actual.push(linea);
    if (limpia.endsWith(delimitador)) {
      let texto = actual.join("\n").trim();
      texto = texto.slice(0, texto.length - delimitador.length).trim();
      actual = [];
      if (texto && !/^USE\s/i.test(texto)) sentencias.push(texto);
    }
  }
  const resto = actual.join("\n").trim();
  if (resto && !/^USE\s/i.test(resto)) sentencias.push(resto);
  return sentencias;
}

async function main(): Promise<void> {
  const config = {
    host: requerida("DB_HOST"),
    port: Number(requerida("DB_PORT")),
    user: requerida("DB_USER"),
    password: Deno.env.get("DB_PASSWORD") ?? "",
  };
  const baseDatos = requerida("DB_NAME");
  if (!/^[A-Za-z0-9_]+$/.test(baseDatos)) {
    console.error("❌ DB_NAME solo puede tener letras, números y guion bajo.");
    Deno.exit(1);
  }

  // 1. Crear la base si no existe (si el usuario no tiene permiso, se sigue: puede que ya exista).
  try {
    const admin = await mysql.createConnection(config);
    await admin.query("CREATE DATABASE IF NOT EXISTS `" + baseDatos + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    await admin.end();
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "ECONNREFUSED") {
      console.error("❌ No hay conexión con MySQL en DB_HOST:DB_PORT. ¿Está encendido el servicio de MySQL?");
      Deno.exit(1);
    }
    if (e.code === "ER_ACCESS_DENIED_ERROR") {
      console.error("❌ MySQL rechazó el usuario o la contraseña de .env (DB_USER / DB_PASSWORD).");
      Deno.exit(1);
    }
    console.warn("⚠️  No se pudo crear la base (" + (e.code ?? "error") + "); se intenta usar la existente.");
  }

  const conexion = await mysql.createConnection({ ...config, database: baseDatos });
  await conexion.query(
    "CREATE TABLE IF NOT EXISTS migraciones_aplicadas (" +
      "archivo VARCHAR(191) PRIMARY KEY, " +
      "aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "avisos TEXT NULL)",
  );
  const [filas] = await conexion.query("SELECT archivo FROM migraciones_aplicadas");
  const aplicadas = new Set((filas as { archivo: string }[]).map((f) => f.archivo));

  const carpeta = new URL("../../Docs/migraciones/", import.meta.url);
  const archivos: string[] = [];
  for await (const entrada of Deno.readDir(carpeta)) {
    if (entrada.isFile && entrada.name.endsWith(".sql")) archivos.push(entrada.name);
  }
  archivos.sort();

  let nuevas = 0;
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) {
      console.log("✔ " + archivo + " (ya aplicada)");
      continue;
    }
    const sentencias = dividirSentencias(await Deno.readTextFile(new URL(archivo, carpeta)));
    const avisos: string[] = [];
    for (const [i, sentencia] of sentencias.entries()) {
      if (/^\s*DROP\s/i.test(sentencia)) {
        avisos.push("sentencia " + (i + 1) + ": DROP omitido (el script no es destructivo)");
        continue;
      }
      try {
        await conexion.query(sentencia);
      } catch (error) {
        const e = error as { errno?: number; message?: string };
        const tolerado = (e.errno !== undefined && YA_APLICADO[e.errno]) ||
          (e.errno === COLUMNA_DESCONOCIDA && /RENAME\s+COLUMN/i.test(sentencia) ? "la columna ya estaba renombrada" : undefined);
        if (tolerado) {
          avisos.push("sentencia " + (i + 1) + ": " + tolerado);
          continue;
        }
        console.error("❌ " + archivo + ", sentencia " + (i + 1) + " falló: " + (e.message ?? String(error)));
        console.error("   " + sentencia.split("\n")[0].slice(0, 120));
        await conexion.end();
        Deno.exit(1);
      }
    }
    await conexion.query("INSERT INTO migraciones_aplicadas (archivo, avisos) VALUES (?, ?)", [
      archivo,
      avisos.length ? avisos.join(" | ") : null,
    ]);
    nuevas++;
    console.log("✅ " + archivo + " aplicada (" + sentencias.length + " sentencias" + (avisos.length ? ", avisos: " + avisos.join("; ") : "") + ")");
  }

  await conexion.end();
  console.log("\nListo: " + nuevas + " migración(es) nueva(s), " + (archivos.length - nuevas) + " ya estaban. Base: la de DB_NAME en .env.");
}

if (import.meta.main) await main();
