/**
 * MySqlViasRegion: implementa IViasProvider con las tablas del precálculo regional (vias_region,
 * edificaciones_region, agua_region). Sin red: solo MySQL (MBRIntersects sobre el índice espacial).
 * `cubre(caja)` dice si todos los bloques de 0,1° que tocan la caja están "listo"; si no, el llamador usa Overpass.
 */
import { type ElementosOsm, type IViasProvider, type LatLon, TerrenoProveedorNoDisponibleError } from "@agrocore/core";
import { type DomainError, Result } from "@agrocore/shared-kernel";
import { sql } from "drizzle-orm";
import type { Database } from "../connection.ts";
import { dbActual } from "../unit-of-work.ts";
import { clavesBloquesVias, TIPO_BLOQUE } from "../precalculo/bloques.ts";
import { type Caja, parsearWkt, wktCaja } from "../precalculo/geo-sql.ts";

const MARGEN_GRADOS = 0.0005; // ~55 m: vías que tocan el borde de la caja
const MAX_BLOQUES = 400;
const VIGENCIA_FECHA_MS = 5 * 60_000;

type Fila = Record<string, unknown>;

export class MySqlViasRegion implements IViasProvider {
  private fecha: { texto: string; hasta: number } | null = null;

  constructor(private readonly db: Database) {}

  async cubre(caja: Caja): Promise<boolean> {
    try {
      const claves = clavesBloquesVias(caja);
      if (claves.length === 0 || claves.length > MAX_BLOQUES) return false;
      const [filas] = await dbActual(this.db).execute(sql`
        SELECT COUNT(*) AS n FROM precalculo_bloques
        WHERE tipo = ${TIPO_BLOQUE.vias} AND estado = 'listo'
          AND clave IN (${sql.join(claves.map((c) => sql`${c}`), sql`, `)})`);
      return Number((filas as unknown as Fila[])[0]?.n) === claves.length;
    } catch {
      return false; // sin MySQL no hay precálculo: se usa el proveedor en vivo
    }
  }

  async obtenerElementos(caja: Caja): Promise<Result<ElementosOsm, DomainError>> {
    try {
      const [s, o, n, e] = caja;
      const poli = wktCaja([s - MARGEN_GRADOS, o - MARGEN_GRADOS, n + MARGEN_GRADOS, e + MARGEN_GRADOS]);
      const db = dbActual(this.db);
      const filtro = sql`MBRIntersects(geom, ST_GeomFromText(${poli}, 4326, 'axis-order=long-lat'))`;
      const [vias, edificios, agua, fecha] = await Promise.all([
        db.execute(sql`SELECT tipo, nombre, ST_AsText(geom, 'axis-order=long-lat') AS wkt FROM vias_region WHERE ${filtro}`),
        db.execute(sql`SELECT ST_AsText(geom, 'axis-order=long-lat') AS wkt FROM edificaciones_region WHERE ${filtro}`),
        db.execute(sql`SELECT tipo, ST_AsText(geom, 'axis-order=long-lat') AS wkt FROM agua_region WHERE ${filtro}`),
        this.fechaPrecalculo(),
      ]);
      const resultado: ElementosOsm = {
        vias: [],
        edificaciones: [],
        aguaPoligonos: [],
        aguaLineas: [],
        fuente: "OpenStreetMap (precálculo regional " + fecha + ")",
      };
      for (const f of vias[0] as unknown as Fila[]) {
        resultado.vias.push({ tipo: String(f.tipo), nombre: f.nombre === null ? null : String(f.nombre), geometria: parsearWkt(String(f.wkt)) });
      }
      for (const f of edificios[0] as unknown as Fila[]) resultado.edificaciones.push(parsearWkt(String(f.wkt)));
      for (const f of agua[0] as unknown as Fila[]) {
        const g: LatLon[] = parsearWkt(String(f.wkt));
        if (f.tipo === "poligono") resultado.aguaPoligonos.push(g);
        else resultado.aguaLineas.push({ tipo: String(f.tipo), geometria: g });
      }
      return Result.ok(resultado);
    } catch (error) {
      return Result.err(
        new TerrenoProveedorNoDisponibleError("OpenStreetMap (precálculo regional)", error instanceof Error ? error.message.slice(0, 120) : "error de MySQL"),
      );
    }
  }

  /** Fecha (YYYY-MM-DD) de la última carga de bloques de vías. */
  private async fechaPrecalculo(): Promise<string> {
    if (this.fecha && this.fecha.hasta > Date.now()) return this.fecha.texto;
    const [filas] = await dbActual(this.db).execute(sql`
      SELECT DATE_FORMAT(MAX(actualizado_en), '%Y-%m-%d') AS f FROM precalculo_bloques WHERE tipo = ${TIPO_BLOQUE.vias} AND estado = 'listo'`);
    const texto = String((filas as unknown as Fila[])[0]?.f ?? "sin fecha");
    this.fecha = { texto, hasta: Date.now() + VIGENCIA_FECHA_MS };
    return texto;
  }
}
