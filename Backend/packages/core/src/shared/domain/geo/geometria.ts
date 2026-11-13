/**
 * Geometría plana para distancias cortas (servicio de dominio puro, sin librerías).
 *
 * Para lotes de hasta 100 ha y vías a pocos metros basta una proyección equirectangular local
 * centrada en el punto de referencia: el error es < 0,5 % a esas distancias, muy por debajo de la
 * incertidumbre de la geometría de OpenStreetMap.
 */

/** [latitud, longitud] en grados decimales. */
export type LatLon = readonly [number, number];

const RADIO_TIERRA_M = 6_371_008.8;
const rad = (g: number): number => (g * Math.PI) / 180;

/** Metros por grado en el punto de referencia (este-oeste y norte-sur). */
export function metrosPorGrado(latitudRef: number): { x: number; y: number } {
  return { x: (Math.PI / 180) * RADIO_TIERRA_M * Math.cos(rad(latitudRef)), y: (Math.PI / 180) * RADIO_TIERRA_M };
}

/** Proyecta `p` a metros (x = este, y = norte) relativos a `origen`. */
export function aMetros(p: LatLon, origen: LatLon): [number, number] {
  const k = metrosPorGrado(origen[0]);
  return [(p[1] - origen[1]) * k.x, (p[0] - origen[0]) * k.y];
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaM(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distancia mínima en metros de `p` a una polilínea (lista de vértices). */
export function distanciaAPolilineaM(p: LatLon, linea: readonly LatLon[]): number {
  if (linea.length === 0) return Infinity;
  if (linea.length === 1) return distanciaM(p, linea[0]);
  let minimo = Infinity;
  for (let i = 0; i < linea.length - 1; i++) {
    const [ax, ay] = aMetros(linea[i], p);
    const [bx, by] = aMetros(linea[i + 1], p);
    const dx = bx - ax;
    const dy = by - ay;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo2));
    minimo = Math.min(minimo, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return minimo;
}

/** true si `p` está dentro del anillo (regla par-impar). El anillo puede venir abierto o cerrado. */
export function puntoEnPoligono(p: LatLon, anillo: readonly LatLon[]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [yi, xi] = anillo[i];
    const [yj, xj] = anillo[j];
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Área en m² de un anillo (fórmula del área de Gauss sobre la proyección local). */
export function areaM2(anillo: readonly LatLon[]): number {
  if (anillo.length < 3) return 0;
  const origen = anillo[0];
  const pts = anillo.map((p) => aMetros(p, origen));
  let suma = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    suma += x1 * y2 - x2 * y1;
  }
  return Math.abs(suma) / 2;
}

/** Centroide del área de un anillo (si el área es ~0, el promedio de los vértices). */
export function centroide(anillo: readonly LatLon[]): LatLon {
  const origen = anillo[0];
  const pts = anillo.map((p) => aMetros(p, origen));
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  const k = metrosPorGrado(origen[0]);
  if (Math.abs(a) < 1e-9) {
    const lat = anillo.reduce((s, p) => s + p[0], 0) / anillo.length;
    const lon = anillo.reduce((s, p) => s + p[1], 0) / anillo.length;
    return [lat, lon];
  }
  cx /= 3 * a;
  cy /= 3 * a;
  return [origen[0] + cy / k.y, origen[1] + cx / k.x];
}

/** true si los segmentos p1-p2 y p3-p4 se cruzan (sin contar extremos compartidos). */
function segmentosSeCruzan(p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]): boolean {
  const orient = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** true si dos lados no consecutivos del anillo (abierto) se cruzan. */
export function anilloSeAutointersecta(anillo: readonly LatLon[]): boolean {
  const origen = anillo[0];
  const pts = anillo.map((p) => aMetros(p, origen));
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // lados vecinos
      if (segmentosSeCruzan(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Caja envolvente [sur, oeste, norte, este] con un margen en metros. */
export function cajaEnvolvente(puntos: readonly LatLon[], margenM = 0): [number, number, number, number] {
  let s = Infinity, o = Infinity, n = -Infinity, e = -Infinity;
  for (const [lat, lon] of puntos) {
    s = Math.min(s, lat);
    n = Math.max(n, lat);
    o = Math.min(o, lon);
    e = Math.max(e, lon);
  }
  const k = metrosPorGrado((s + n) / 2);
  return [s - margenM / k.y, o - margenM / k.x, n + margenM / k.y, e + margenM / k.x];
}
