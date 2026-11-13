"use client";

/**
 * Selector de ubicación en mapa mundial (OpenStreetMap + Leaflet).
 * Modos: punto (un clic) o área (polígono libre o rectángulo), dibujados sin librerías extra.
 * Incluye buscador opcional de lugares (Nominatim) que solo consulta al enviar el formulario.
 * El CSS de Leaflet se importa globalmente en app/globals.css.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import type * as L from "leaflet";
import { AREA_MAXIMA_HA, MAX_VERTICES_AREA, type AreaSeleccionadaDto } from "@agrocore/contracts";
import { IconoPin, IconoPoligono } from "@/components/ui/Iconos";

export interface SelectorMapaProps {
  valor?: AreaSeleccionadaDto | null;
  onCambio?: (area: AreaSeleccionadaDto | null) => void;
  soloLectura?: boolean;
  altura?: string;
  /** Polilíneas [lat, lon] dibujadas encima (ej. la vía detectada). */
  resaltado?: { lineas: [number, number][][]; color?: string } | null;
}

type Modo = "punto" | "area";
type Vertice = [number, number]; // [lat, lon]
type ResultadoBusqueda = { place_id: number; display_name: string; lat: string; lon: string };

/** Área aproximada en ha con proyección plana local (suficiente para lotes de hasta ~100 ha). */
function areaAproximadaHa(vertices: Vertice[]): number {
  if (vertices.length < 3) return 0;
  const latMedia = vertices.reduce((s, v) => s + v[0], 0) / vertices.length;
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos((latMedia * Math.PI) / 180);
  const pts = vertices.map((v) => [v[1] * mLon, v[0] * mLat]);
  let suma = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    suma += x1 * y2 - x2 * y1;
  }
  return Math.abs(suma) / 2 / 10_000;
}

function aVertices(valor: AreaSeleccionadaDto | null | undefined): Vertice[] {
  if (!valor || valor.tipo !== "poligono") return [];
  const anillo = valor.geojson.coordinates[0].map(([lon, lat]) => [lat, lon] as Vertice);
  const primero = anillo[0];
  const ultimo = anillo[anillo.length - 1];
  if (anillo.length > 1 && primero[0] === ultimo[0] && primero[1] === ultimo[1]) anillo.pop();
  return anillo;
}

function aPoligono(vertices: Vertice[]): AreaSeleccionadaDto {
  const anillo = vertices.map(([lat, lon]) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))] as [number, number]);
  anillo.push(anillo[0]);
  return { tipo: "poligono", geojson: { type: "Polygon", coordinates: [anillo] } };
}

const BTN = "rounded border px-2 py-1 text-xs font-medium disabled:opacity-40";

export function SelectorMapa({ valor, onCambio, soloLectura = false, altura = "320px", resaltado = null }: SelectorMapaProps) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const capaRef = useRef<L.LayerGroup | null>(null);
  const capaResaltadoRef = useRef<L.LayerGroup | null>(null);
  const [listo, setListo] = useState(false);

  const [modo, setModo] = useState<Modo>("punto");
  const [borrador, setBorrador] = useState<Vertice[]>([]); // vértices en dibujo
  const [dibujando, setDibujando] = useState(false);
  const [esRectangulo, setEsRectangulo] = useState(false);

  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const ultimaBusquedaRef = useRef(0);

  // Ref para que los manejadores de Leaflet (creados una sola vez) vean el estado actual.
  const estado = useRef({ modo, dibujando, esRectangulo, borrador, soloLectura, onCambio });
  useEffect(() => {
    estado.current = { modo, dibujando, esRectangulo, borrador, soloLectura, onCambio };
  });

  const verticesValor = aVertices(valor);
  const verticesMostrados = dibujando || valor?.tipo !== "poligono" ? borrador : verticesValor;
  const areaHa = areaAproximadaHa(verticesMostrados);
  const excede = areaHa > AREA_MAXIMA_HA;

  // Crear el mapa una sola vez
  useEffect(() => {
    let cancelado = false;
    import("leaflet").then((Lf) => {
      if (cancelado || !contenedorRef.current || mapaRef.current) return;
      leafletRef.current = Lf;
      const punto = valor?.tipo === "punto" ? ([valor.latitud, valor.longitud] as Vertice) : null;
      const poligono = aVertices(valor);
      const centro: Vertice | null = punto ?? (poligono.length ? poligono[0] : null);

      const map = Lf.map(contenedorRef.current, { worldCopyJump: true }).setView(centro ?? [15, 0], centro ? 15 : 2);
      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      capaRef.current = Lf.layerGroup().addTo(map);
      capaResaltadoRef.current = Lf.layerGroup().addTo(map);
      mapaRef.current = map;

      map.on("click", (e: L.LeafletMouseEvent) => {
        const s = estado.current;
        if (s.soloLectura) return;
        const v: Vertice = [Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))];
        if (s.modo === "punto") {
          s.onCambio?.({ tipo: "punto", latitud: v[0], longitud: v[1] });
          return;
        }
        if (!s.dibujando) return;
        if (s.esRectangulo) {
          if (s.borrador.length === 0) {
            setBorrador([v]);
          } else {
            const [a] = s.borrador;
            const esquinas: Vertice[] = [a, [a[0], v[1]], v, [v[0], a[1]]];
            setBorrador(esquinas);
            setDibujando(false);
            setEsRectangulo(false);
            if (areaAproximadaHa(esquinas) <= AREA_MAXIMA_HA) s.onCambio?.(aPoligono(esquinas));
          }
        } else if (s.borrador.length < MAX_VERTICES_AREA) {
          setBorrador([...s.borrador, v]);
        }
      });
      setListo(true);
    });
    return () => {
      cancelado = true;
      mapaRef.current?.remove();
      mapaRef.current = null;
      capaRef.current = null;
      capaResaltadoRef.current = null;
      setListo(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibujar punto / polígono
  useEffect(() => {
    const Lf = leafletRef.current;
    const capa = capaRef.current;
    if (!listo || !Lf || !capa) return;
    capa.clearLayers();
    // Tras un rectángulo/área demasiado grande el borrador queda visible (en rojo) aunque no se envíe.
    const vertices = dibujando || valor?.tipo !== "poligono" ? borrador : aVertices(valor);
    const exceso = areaAproximadaHa(vertices) > AREA_MAXIMA_HA;
    if (!dibujando && valor?.tipo === "punto") {
      Lf.circleMarker([valor.latitud, valor.longitud], { radius: 8, color: "#fff", weight: 2, fillColor: "#0f172a", fillOpacity: 1 })
        .bindPopup(`<b>Punto</b><br/>Lat: ${valor.latitud}<br/>Lon: ${valor.longitud}`)
        .addTo(capa);
    }
    const color = exceso ? "#dc2626" : "#059669";
    if (vertices.length >= 3 && !dibujando) {
      Lf.polygon(vertices, { color, weight: 2, fillColor: color, fillOpacity: 0.2 }).addTo(capa);
    } else if (vertices.length >= 2) {
      Lf.polyline(vertices, { color, weight: 2, dashArray: "5,5" }).addTo(capa);
    }
    if (dibujando) {
      vertices.forEach((v) => Lf.circleMarker(v, { radius: 4, color, fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(capa));
    }
  }, [listo, valor, borrador, dibujando]);

  // Dibujar polilíneas resaltadas
  useEffect(() => {
    const Lf = leafletRef.current;
    const capa = capaResaltadoRef.current;
    if (!listo || !Lf || !capa) return;
    capa.clearLayers();
    resaltado?.lineas.forEach((linea) => {
      if (linea.length >= 2) Lf.polyline(linea, { color: resaltado.color ?? "#dc2626", weight: 4 }).addTo(capa);
    });
  }, [listo, resaltado]);

  // Centrar cuando el valor cambia desde fuera (p. ej. coordenadas escritas a mano)
  const claveValor = valor ? JSON.stringify(valor) : "";
  useEffect(() => {
    if (!listo || !mapaRef.current || !valor || dibujando) return;
    const mapa = mapaRef.current;
    if (valor.tipo === "punto") {
      if (!mapa.getBounds().contains([valor.latitud, valor.longitud])) mapa.setView([valor.latitud, valor.longitud], Math.max(mapa.getZoom(), 15));
    } else if (leafletRef.current) {
      mapa.fitBounds(leafletRef.current.latLngBounds(aVertices(valor)), { maxZoom: 17 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, claveValor]);

  function cambiarModo(m: Modo) {
    setModo(m);
    setDibujando(false);
    setEsRectangulo(false);
    setBorrador([]);
  }

  function iniciarArea(rect: boolean) {
    setModo("area");
    setBorrador([]);
    setDibujando(true);
    setEsRectangulo(rect);
  }

  function terminarArea() {
    if (borrador.length < 3 || borrador.length > MAX_VERTICES_AREA) return;
    setDibujando(false);
    if (areaAproximadaHa(borrador) <= AREA_MAXIMA_HA) onCambio?.(aPoligono(borrador));
  }

  function borrar() {
    setBorrador([]);
    setDibujando(false);
    setEsRectangulo(false);
    onCambio?.(null);
  }

  async function buscar(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const q = consulta.trim();
    if (q.length < 2) return;
    // Throttle: máximo 1 petición por segundo a Nominatim
    const espera = ultimaBusquedaRef.current + 1000 - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaBusquedaRef.current = Date.now();
    setBuscando(true);
    setErrorBusqueda(null);
    try {
      const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" + encodeURIComponent(q));
      if (!res.ok) throw new Error("status " + res.status);
      const datos = (await res.json()) as ResultadoBusqueda[];
      setResultados(datos);
      if (datos.length === 0) setErrorBusqueda("Sin resultados.");
    } catch {
      setErrorBusqueda("No se pudo buscar el lugar.");
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }

  function elegirResultado(r: ResultadoBusqueda) {
    mapaRef.current?.setView([Number(r.lat), Number(r.lon)], 14);
    setResultados([]);
  }

  const ayuda = soloLectura
    ? "Ubicación en el mapa"
    : modo === "punto"
      ? "Haz clic en el mapa para marcar el punto"
      : dibujando
        ? esRectangulo
          ? borrador.length === 0
            ? "Clic en la primera esquina"
            : "Clic en la esquina opuesta"
          : `Clic para agregar vértices (${borrador.length}/${MAX_VERTICES_AREA}); mínimo 3`
        : "Dibuja con «Área» o «Rectángulo»";

  return (
    <div className="space-y-1.5">
      {!soloLectura && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => cambiarModo("punto")} className={`${BTN} inline-flex items-center gap-1.5 ${modo === "punto" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <IconoPin width={14} height={14} /> Punto
            </button>
            <button type="button" onClick={() => iniciarArea(false)} className={`${BTN} inline-flex items-center gap-1.5 ${modo === "area" && !esRectangulo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <IconoPoligono width={14} height={14} /> Polígono
            </button>
            {modo === "area" && (
              <>
                <button type="button" onClick={terminarArea} disabled={!dibujando || esRectangulo || borrador.length < 3} className={`${BTN} border-emerald-600 text-emerald-700`}>
                  Cerrar polígono
                </button>
                <button type="button" onClick={() => iniciarArea(true)} className={`${BTN} ${esRectangulo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                  Rectángulo
                </button>
              </>
            )}
            <button type="button" onClick={borrar} className={`${BTN} border-slate-300 text-slate-600 hover:bg-slate-50`}>
              Limpiar
            </button>
          </div>
          <form onSubmit={buscar} className="flex gap-1.5">
            <input value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar un lugar (opcional)" className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
            <button type="submit" disabled={buscando} className={`${BTN} border-slate-300 bg-white`}>
              {buscando ? "Buscando…" : "Buscar"}
            </button>
          </form>
          {errorBusqueda && <p className="text-xs text-amber-700">{errorBusqueda}</p>}
          {resultados.length > 0 && (
            <ul className="max-h-32 overflow-y-auto rounded border border-slate-200 bg-white text-xs">
              {resultados.map((r) => (
                <li key={r.place_id}>
                  <button type="button" onClick={() => elegirResultado(r)} className="w-full px-2 py-1 text-left hover:bg-slate-100">
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-500">Búsqueda © OpenStreetMap (Nominatim)</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="font-medium">{ayuda}</span>
        {verticesMostrados.length >= 3 && (
          <span className={`rounded-full px-2 py-0.5 font-medium ${excede ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>
            {excede ? `Área ≈ ${areaHa.toFixed(1)} ha: supera el máximo de ${AREA_MAXIMA_HA} ha (no se enviará)` : `Área ≈ ${areaHa.toFixed(2)} ha`}
          </span>
        )}
      </div>

      <div ref={contenedorRef} style={{ height: altura, width: "100%" }} className="z-0 overflow-hidden rounded-lg border border-slate-300 shadow-inner" />
    </div>
  );
}
