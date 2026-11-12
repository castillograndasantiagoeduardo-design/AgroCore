/**
 * Adaptador secundario: implementa ICultivoRepository con el catálogo versionado en código.
 *
 * Valida TODO el catálogo con Cultivo.crear() al construirse (Fail-Fast): si un dato está mal
 * cargado, la API no arranca y el mensaje dice qué cultivo y qué campo fallan. Lanzar aquí es
 * correcto (Regla 3): es un fallo técnico de configuración, no una regla de negocio en tiempo de uso.
 *
 * Para pasarlo a MySQL más adelante: crear MySqlCultivoRepository con el mismo puerto y cambiar
 * una línea en createContainer. core no se entera.
 */
import { Cultivo, type CrearCultivoDatos, type ICultivoRepository } from "@duitamacrece/core";
import { CATALOGO_CULTIVOS } from "./catalogo-cultivos.datos.ts";

export class CatalogoCultivosEnMemoria implements ICultivoRepository {
  private readonly cultivos: readonly Cultivo[];
  private readonly porClave: ReadonlyMap<string, Cultivo>;

  constructor(datos: readonly CrearCultivoDatos[] = CATALOGO_CULTIVOS) {
    const cultivos: Cultivo[] = [];
    const porClave = new Map<string, Cultivo>();

    for (const d of datos) {
      const r = Cultivo.crear(d);
      if (!r.ok) throw new Error("[CatalogoCultivos] " + r.error.message);
      if (porClave.has(r.value.clave)) throw new Error("[CatalogoCultivos] Clave repetida: " + r.value.clave);
      cultivos.push(r.value);
      porClave.set(r.value.clave, r.value);
    }

    this.cultivos = cultivos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    this.porClave = porClave;
  }

  listar(): Promise<Cultivo[]> {
    return Promise.resolve([...this.cultivos]);
  }

  buscarPorClave(clave: string): Promise<Cultivo | null> {
    return Promise.resolve(this.porClave.get(clave) ?? null);
  }
}
