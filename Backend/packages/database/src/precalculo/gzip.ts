/** gzip con las API web estándar (CompressionStream), sin dependencias. */

async function aBytes(flujo: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

export async function comprimirGzip(bytes: Uint8Array): Promise<Uint8Array> {
  const origen = new Blob([bytes as BlobPart]).stream();
  return await aBytes(origen.pipeThrough(new CompressionStream("gzip")));
}

export async function descomprimirGzip(bytes: Uint8Array): Promise<Uint8Array> {
  const origen = new Blob([bytes as BlobPart]).stream();
  return await aBytes(origen.pipeThrough(new DecompressionStream("gzip")));
}

export async function comprimirJson(valor: unknown): Promise<Uint8Array> {
  return await comprimirGzip(new TextEncoder().encode(JSON.stringify(valor)));
}

export async function descomprimirJson<T>(bytes: Uint8Array): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await descomprimirGzip(bytes))) as T;
}
