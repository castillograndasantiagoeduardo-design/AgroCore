/**
 * Value Object inmutable: lo que el usuario seleccionó en el mapa (un punto o un polígono).
 *
 * Reglas de negocio que protege:
 *  1. Coordenadas dentro de rangos válidos (latitud −90..90, longitud −180..180).
 *  2. Un polígono tiene al menos 3 vértices distintos, como máximo MAX_VERTICES_AREA, y no se autointersecta.
 *  3. El área del polígono es mayor que 0 y no supera AREA_MAXIMA_HA (100 ha).
 *  4. El punto representativo (centroide) y el área se DERIVAN; nadie los escribe a mano.
 */
import { DomainError, Result } from "@agrocore/shared-kernel";
import { AREA_MAXIMA_HA, type AreaSeleccionadaDto, MAX_VERTICES_AREA, type PoligonoGeoJson, type UbicacionResueltaDto } from "@agrocore/contracts";
import { anilloSeAutointersecta, areaM2, cajaEnvolvente, centroide, type LatLon, puntoEnPoligono } from "./geometria.ts";

/** El área seleccionada no es válida (pocos vértices, se autointersecta, área nula). HTTP 422. */
export class AreaInvalidaError extends DomainError {
  constructor(motivo: string) {
    super("AREA_INVALIDA", "El área seleccionada no es válida: " + motivo + ".");
  }
}

/** El polígono supera el área máxima permitida. HTTP 422. */
export class AreaDemasiadoGrandeError extends DomainError {
  constructor(areaHa: number) {
    super(
      "AREA_DEMASIADO_GRANDE",
      "El área seleccionada mide " + Math.round(areaHa * 10) / 10 + " ha y el máximo es " + AREA_MAXIMA_HA +
        " ha. Dibuja un lote más pequeño.",
    );
  }
}

export class AreaSeleccionada {
  private constructor(
    public readonly tipo: "punto" | "poligono",
    /** Punto representativo: el punto o el centroide del polígono. */
    public readonly centro: LatLon,
    /** Anillo [lat, lon] abierto (sin repetir el primer vértice); vacío para un punto. */
    public readonly anillo: readonly LatLon[],
    public readonly areaHa: number | null,
  ) {
    Object.freeze(this);
  }

  static punto(latitud: number, longitud: number): Result<AreaSeleccionada, DomainError> {
    if (!Number.isFinite(latitud) || latitud < -90 || latitud > 90 || !Number.isFinite(longitud) || longitud < -180 || longitud > 180) {
      return Result.err(new AreaInvalidaError("coordenadas fuera de rango (" + latitud + ", " + longitud + ")"));
    }
    return Result.ok(new AreaSeleccionada("punto", [latitud, longitud], [], null));
  }

  /** Solo para coordenadas YA validadas (p. ej. la ubicación de una finca guardada). */
  static puntoValidado(latitud: number, longitud: number): AreaSeleccionada {
    return new AreaSeleccionada("punto", [latitud, longitud], [], null);
  }

  static poligono(geojson: PoligonoGeoJson): Result<AreaSeleccionada, DomainError> {
    const anilloGeo = geojson.coordinates[0] ?? [];
    // GeoJSON es [lon, lat]; internamente usamos [lat, lon].
    let anillo: LatLon[] = anilloGeo.map(([lon, lat]) => [lat, lon] as const);
    if (anillo.length > 1) {
      const [a, z] = [anillo[0], anillo[anillo.length - 1]];
      if (a[0] === z[0] && a[1] === z[1]) anillo = anillo.slice(0, -1);
    }
    // Quitar vértices repetidos consecutivos.
    anillo = anillo.filter((p, i) => i === 0 || p[0] !== anillo[i - 1][0] || p[1] !== anillo[i - 1][1]);
    if (anillo.length < 3) return Result.err(new AreaInvalidaError("se necesitan al menos 3 vértices distintos"));
    if (anillo.length > MAX_VERTICES_AREA) return Result.err(new AreaInvalidaError("máximo " + MAX_VERTICES_AREA + " vértices"));
    for (const [lat, lon] of anillo) {
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return Result.err(new AreaInvalidaError("hay vértices fuera de rango"));
    }
    if (anilloSeAutointersecta(anillo)) return Result.err(new AreaInvalidaError("los lados del polígono se cruzan"));

    const areaHa = areaM2(anillo) / 10_000;
    if (areaHa < 0.0001) return Result.err(new AreaInvalidaError("el polígono no tiene área"));
    if (areaHa > AREA_MAXIMA_HA) return Result.err(new AreaDemasiadoGrandeError(areaHa));

    return Result.ok(new AreaSeleccionada("poligono", centroide(anillo), anillo, Math.round(areaHa * 100) / 100));
  }

  static desdeDto(dto: AreaSeleccionadaDto): Result<AreaSeleccionada, DomainError> {
    return dto.tipo === "punto" ? AreaSeleccionada.punto(dto.latitud, dto.longitud) : AreaSeleccionada.poligono(dto.geojson);
  }

  get latitud(): number {
    return this.centro[0];
  }
  get longitud(): number {
    return this.centro[1];
  }

  /** true si `p` está dentro del polígono (para un punto: si es el mismo punto). */
  contiene(p: LatLon): boolean {
    if (this.tipo === "punto") return p[0] === this.centro[0] && p[1] === this.centro[1];
    return puntoEnPoligono(p, this.anillo);
  }

  /** Caja [sur, oeste, norte, este] con margen (para consultar proveedores por bbox). */
  caja(margenM: number): [number, number, number, number] {
    return cajaEnvolvente(this.tipo === "punto" ? [this.centro] : this.anillo, margenM);
  }

  /**
   * Puntos de muestreo para estimar qué fracción del área está afectada (carretera, edificación, agua).
   * Una malla regular dentro del polígono de hasta `lado`×`lado` celdas; para un punto, el propio punto.
   */
  puntosMuestreo(lado = 12): LatLon[] {
    if (this.tipo === "punto") return [this.centro];
    const [s, o, n, e] = this.caja(0);
    const puntos: LatLon[] = [];
    for (let i = 0; i < lado; i++) {
      for (let j = 0; j < lado; j++) {
        const p: LatLon = [s + ((i + 0.5) / lado) * (n - s), o + ((j + 0.5) / lado) * (e - o)];
        if (puntoEnPoligono(p, this.anillo)) puntos.push(p);
      }
    }
    return puntos.length > 0 ? puntos : [this.centro];
  }

  /** Lado aproximado del lote en metros (raíz del área), útil para mensajes. */
  get ladoAproximadoM(): number | null {
    return this.areaHa === null ? null : Math.sqrt(this.areaHa * 10_000);
  }

  toGeoJson(): PoligonoGeoJson | null {
    if (this.tipo === "punto") return null;
    const anillo = this.anillo.map(([lat, lon]) => [lon, lat] as [number, number]);
    return { type: "Polygon", coordinates: [[...anillo, anillo[0]]] };
  }

  resumen(): UbicacionResueltaDto {
    return {
      tipo: this.tipo,
      latitud: Math.round(this.centro[0] * 1e6) / 1e6,
      longitud: Math.round(this.centro[1] * 1e6) / 1e6,
      areaHa: this.areaHa,
      hemisferio: this.centro[0] < 0 ? "sur" : "norte",
    };
  }
}

