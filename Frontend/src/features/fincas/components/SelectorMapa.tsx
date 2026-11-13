"use client";

/**
 * Componente de Mapa Interactivo (OpenStreetMap + Leaflet).
 * Permite hacer clic en cualquier parte del mapa para seleccionar coordenadas (latitud/longitud),
 * muestra el límite del área de estudio de Duitama y un marcador interactivo.
 */
import { useEffect, useRef } from "react";
import type * as L from "leaflet";

interface SelectorMapaProps {
  latitud?: number;
  longitud?: number;
  onSelectCoordenadas?: (lat: number, lon: number) => void;
  soloLectura?: boolean;
  altura?: string;
  zoomInicial?: number;
}

// Bounding box oficial de AgroCore (5.70 a 6.15 N, -73.25 a -72.85 W)
const AREA_DUITAMA = {
  latMin: 5.70,
  latMax: 6.15,
  lonMin: -73.25,
  lonMax: -72.85,
};

export function SelectorMapa({
  latitud,
  longitud,
  onSelectCoordenadas,
  soloLectura = false,
  altura = "320px",
  zoomInicial = 12,
}: SelectorMapaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const puntoValido =
    typeof latitud === "number" &&
    !Number.isNaN(latitud) &&
    typeof longitud === "number" &&
    !Number.isNaN(longitud);

  const dentroArea =
    puntoValido &&
    latitud >= AREA_DUITAMA.latMin &&
    latitud <= AREA_DUITAMA.latMax &&
    longitud >= AREA_DUITAMA.lonMin &&
    longitud <= AREA_DUITAMA.lonMax;

  useEffect(() => {
    let cancelado = false;

    import("leaflet").then((L) => {
      if (cancelado || !containerRef.current || mapInstanceRef.current) return;

      const centroLat = puntoValido ? latitud : 5.8269;
      const centroLon = puntoValido ? longitud : -73.0297;

      const map = L.map(containerRef.current).setView(
        [centroLat, centroLon],
        zoomInicial,
      );
      mapInstanceRef.current = map;

      // Capa base OpenStreetMap
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // Rectángulo visual del área agronómica de estudio
      const bounds: L.LatLngBoundsExpression = [
        [AREA_DUITAMA.latMin, AREA_DUITAMA.lonMin],
        [AREA_DUITAMA.latMax, AREA_DUITAMA.lonMax],
      ];

      L.rectangle(bounds, {
        color: "#059669",
        weight: 2,
        dashArray: "6, 6",
        fillColor: "#10b981",
        fillOpacity: 0.08,
      })
        .addTo(map)
        .bindTooltip("Área de estudio agronómico de AgroCore (calibrada con IDEAM)", {
          sticky: true,
        });

      // Icono de pin con estilo
      const customIcon = L.divIcon({
        className: "custom-leaflet-marker",
        html: `
          <div style="
            background: #0f172a;
            color: #ffffff;
            width: 32px;
            height: 32px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.4);
            border: 2px solid white;
          ">
            <span style="transform: rotate(45deg); font-size: 14px; margin-bottom: 2px;">📍</span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      if (puntoValido) {
        markerRef.current = L.marker([latitud, longitud], { icon: customIcon })
          .addTo(map)
          .bindPopup(`<b>Punto seleccionado</b><br/>Lat: ${latitud}<br/>Lon: ${longitud}`);
      }

      if (!soloLectura && onSelectCoordenadas) {
        map.on("click", (e: L.LeafletMouseEvent) => {
          const lat = Number(e.latlng.lat.toFixed(4));
          const lon = Number(e.latlng.lng.toFixed(4));

          if (markerRef.current) {
            markerRef.current.setLatLng(e.latlng);
            markerRef.current.setPopupContent(`<b>Punto seleccionado</b><br/>Lat: ${lat}<br/>Lon: ${lon}`);
          } else {
            markerRef.current = L.marker(e.latlng, { icon: customIcon })
              .addTo(map)
              .bindPopup(`<b>Punto seleccionado</b><br/>Lat: ${lat}<br/>Lon: ${lon}`);
          }

          onSelectCoordenadas(lat, lon);
        });
      }
    });

    return () => {
      cancelado = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Actualizar marcador y vista si cambian las coordenadas desde fuera
  useEffect(() => {
    if (!mapInstanceRef.current || !puntoValido) return;

    import("leaflet").then((L) => {
      if (markerRef.current) {
        markerRef.current.setLatLng([latitud, longitud]);
        markerRef.current.setPopupContent(
          `<b>Punto seleccionado</b><br/>Lat: ${latitud}<br/>Lon: ${longitud}`,
        );
      } else if (mapInstanceRef.current) {
        const customIcon = L.divIcon({
          className: "custom-leaflet-marker",
          html: `
            <div style="
              background: #0f172a;
              color: #ffffff;
              width: 32px;
              height: 32px;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.4);
              border: 2px solid white;
            ">
              <span style="transform: rotate(45deg); font-size: 14px; margin-bottom: 2px;">📍</span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        markerRef.current = L.marker([latitud, longitud], { icon: customIcon }).addTo(
          mapInstanceRef.current,
        );
      }
      mapInstanceRef.current?.panTo([latitud, longitud]);
    });
  }, [latitud, longitud, puntoValido]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span className="font-medium">
          {soloLectura ? "Ubicación geográfica en el mapa" : "Haz clic en el mapa para marcar tu finca"}
        </span>
        {puntoValido && (
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              dentroArea
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {dentroArea
              ? "✓ Dentro del área de Duitama"
              : "⚠️ Fuera de calibración Duitama"}
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        style={{ height: altura, width: "100%" }}
        className="overflow-hidden rounded-lg border border-slate-300 shadow-inner z-0"
      />
    </div>
  );
}

