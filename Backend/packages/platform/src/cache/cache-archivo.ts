/**
 * Caché en archivos JSON (por defecto bajo Backend/.cache/). Sobrevive a los reinicios.
 * Nunca lanza: un directorio sin permisos o un archivo corrupto equivalen a "no hay caché".
 */
const DIA_MS = 86_400_000;

/** Directorio por defecto: Backend/.cache/<subdirectorio>/ (este archivo está en Backend/packages/platform/src/cache/). */
export function directorioCachePorDefecto(subdirectorio: string): string {
  const url = new URL("../../../../.cache/" + subdirectorio + "/", import.meta.url);
  return decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}

async function nombreSeguro(clave: string): Promise<string> {
  const limpio = clave.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  if (limpio.length <= 60) return limpio;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clave));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return limpio.slice(0, 20) + "_" + hex;
}

export class CacheArchivo {
  constructor(private readonly directorio: string, private readonly ttlDias: number) {}

  private async ruta(clave: string): Promise<string> {
    return this.directorio.replace(/[\/]+$/, "") + "/" + await nombreSeguro(clave) + ".json";
  }

  /** Valor guardado y vigente, o null. */
  async leer<T>(clave: string): Promise<T | null> {
    try {
      const ruta = await this.ruta(clave);
      const info = await Deno.stat(ruta);
      const edadMs = Date.now() - (info.mtime?.getTime() ?? 0);
      if (edadMs > this.ttlDias * DIA_MS) return null;
      return JSON.parse(await Deno.readTextFile(ruta)) as T;
    } catch {
      return null;
    }
  }

  async escribir(clave: string, valor: unknown): Promise<void> {
    try {
      await Deno.mkdir(this.directorio, { recursive: true });
      await Deno.writeTextFile(await this.ruta(clave), JSON.stringify(valor));
    } catch { /* sin caché de archivo no se rompe nada */ }
  }
}
