"use client";

/**
 * Vista principal de Explorar: mapa + formulario + resultados con carga progresiva.
 */
import { useMemo } from "react";
import { SelectorMapa } from "@/features/fincas/components/SelectorMapa";
import { BotonImprimirTicket } from "@/features/impresion/components/BotonImprimirTicket";
import { useExplorar } from "../hooks/use-explorar";
import { BannerAptitud } from "./BannerAptitud";
import { CalendarioLote } from "./CalendarioLote";
import { FichaTerreno } from "./FichaTerreno";
import { FormularioSitio } from "./FormularioSitio";
import { FuentesYVacios } from "./FuentesYVacios";
import { GuardarComoFinca } from "./GuardarComoFinca";
import { ListaOportunidades } from "./ListaOportunidades";
import { TablaEstrategias } from "./TablaEstrategias";
import { TarjetaEstrategiaGlobal } from "./TarjetaEstrategiaGlobal";

export function ExplorarVista() {
  const x = useExplorar();
  const { perfil, comparacion } = x;

  // Si el sitio es carretera, se resalta en rojo la vía detectada.
  const resaltado = useMemo(
    () =>
      perfil && perfil.aptitud === "no_apto_carretera" && perfil.viasCercanas.length > 0
        ? { lineas: perfil.viasCercanas.map((v) => v.geometria as [number, number][]), color: "#dc2626" }
        : null,
    [perfil],
  );

  const mensajeCarga =
    x.fase === "terreno"
      ? "Analizando terreno: OpenStreetMap, MODIS, SRTM, SoilGrids…"
      : x.fase === "clima"
        ? "Consultando 30 años de clima NASA POWER (la primera vez tarda ~1 min)…"
        : null;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Explora cualquier lugar del mundo</h1>
        <p className="text-sm text-slate-600">
          Marca un punto o dibuja un área (hasta 100 ha). Verás el suelo, el terreno, el clima, el calendario del lote y
          una comparación de estrategias de rotación con su evidencia.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">1. Elige el lugar</h2>
          <SelectorMapa valor={x.area} onCambio={x.setArea} altura="420px" resaltado={resaltado} />
        </div>
        <FormularioSitio
          cultivos={x.cultivos}
          errorCultivos={x.errorCultivos}
          cargando={x.cargando}
          puedeAnalizar={x.area !== null}
          onAnalizar={x.analizar}
        />
      </div>

      <div aria-live="polite" className="space-y-1">
        {mensajeCarga && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" aria-hidden="true" />
            <div>
              <p className="font-semibold">{mensajeCarga}</p>
              <p className="text-xs">
                Consultando: {x.fuenteActual} · {x.segundos} s
              </p>
            </div>
          </div>
        )}
        {x.error && (
          <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {x.error}
          </p>
        )}
      </div>

      {perfil && <BannerAptitud perfil={perfil} />}
      {perfil && <FichaTerreno perfil={perfil} />}

      {comparacion && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <h2 className="text-lg font-bold">📍 Resumen del sitio</h2>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              <li>Clima: {comparacion.sitio.clasificacionClimatica}</li>
              <li>
                Altitud: {Math.round(comparacion.sitio.altitudReferenciaM)} m ({comparacion.sitio.fuenteAltitud})
              </li>
              <li>Lluvia anual: {Math.round(comparacion.clima.lluviaAnualMm)} mm</li>
              <li>ET0 anual: {Math.round(comparacion.clima.etoAnualMm)} mm</li>
              <li>Régimen de lluvias: {comparacion.clima.regimenLluvias}</li>
              <li>Riego: {comparacion.sitio.tieneRiego ? "Sí" : "No"}</li>
            </ul>
          </section>

          <CalendarioLote calendario={comparacion.calendario} />
          <TablaEstrategias comparacion={comparacion} />
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {comparacion.estrategias.map((e) => (
              <TarjetaEstrategiaGlobal key={e.id} estrategia={e} mejor={e.id === comparacion.estrategiaMejorPuntuada} />
            ))}
          </div>
          <ListaOportunidades oportunidades={comparacion.oportunidades} />

          <div className="flex flex-wrap items-start gap-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <GuardarComoFinca comparacion={comparacion} area={x.area} />
            <BotonImprimirTicket entrada={x.entradaEnviada} comparacion={comparacion} perfil={perfil} />
          </div>
        </div>
      )}

      {(perfil || comparacion) && <FuentesYVacios perfil={perfil} comparacion={comparacion} />}
    </section>
  );
}
