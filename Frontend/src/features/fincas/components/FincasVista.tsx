"use client";

/**
 * Vista del módulo fincas: formulario de registro + tabla.
 * La finca puede estar en cualquier lugar del mundo: se marca un punto o se dibuja un área en el mapa.
 */
import { type FormEvent, useEffect, useState } from "react";
import type { AreaSeleccionadaDto, CultivoDto } from "@agrocore/contracts";
import { cultivosApi } from "@/features/cultivos/api/cultivos.api";
import { useFincas } from "../hooks/use-fincas";
import { SelectorMapa } from "./SelectorMapa";

const FORM_VACIO = {
  nombre: "",
  latitud: "",
  longitud: "",
  altitudM: "",
  localidad: "",
  region: "",
  pais: "",
  cultivoActual: "",
  tieneRiego: false,
};

/** "" → undefined; "5,83" → 5.83 (acepta coma decimal). */
function numeroOpcional(valor: string): number | undefined {
  const limpio = valor.trim().replace(",", ".");
  return limpio === "" ? undefined : Number(limpio);
}

function textoOpcional(valor: string): string | undefined {
  return valor.trim() === "" ? undefined : valor.trim();
}

export function FincasVista() {
  const { pagina, cargando, error, crear } = useFincas();
  const [form, setForm] = useState(FORM_VACIO);
  const [area, setArea] = useState<AreaSeleccionadaDto | null>(null);
  const [cultivos, setCultivos] = useState<CultivoDto[]>([]);

  useEffect(() => {
    let activo = true;
    cultivosApi.listar().then((res) => {
      if (activo && res.ok) setCultivos(res.data);
    });
    return () => {
      activo = false;
    };
  }, []);

  function cambiar(campo: keyof typeof FORM_VACIO, valor: string | boolean) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  /** Lo que el usuario marcó o dibujó en el mapa. */
  function onCambioMapa(nueva: AreaSeleccionadaDto | null) {
    setArea(nueva && nueva.tipo === "poligono" ? nueva : null);
    if (!nueva) {
      setForm((f) => ({ ...f, latitud: "", longitud: "" }));
    } else if (nueva.tipo === "punto") {
      setForm((f) => ({ ...f, latitud: String(nueva.latitud), longitud: String(nueva.longitud) }));
    } else {
      // Centro del área = promedio de los vértices (sin el de cierre)
      const anillo = nueva.geojson.coordinates[0].slice(0, -1);
      const lon = anillo.reduce((s, p) => s + p[0], 0) / anillo.length;
      const lat = anillo.reduce((s, p) => s + p[1], 0) / anillo.length;
      setForm((f) => ({ ...f, latitud: lat.toFixed(6), longitud: lon.toFixed(6) }));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await crear({
      nombre: form.nombre,
      latitud: numeroOpcional(form.latitud) ?? NaN,
      longitud: numeroOpcional(form.longitud) ?? NaN,
      altitudM: numeroOpcional(form.altitudM),
      localidad: textoOpcional(form.localidad),
      region: textoOpcional(form.region),
      pais: textoOpcional(form.pais),
      area: area?.tipo === "poligono" ? area.geojson : undefined,
      cultivoActual: textoOpcional(form.cultivoActual),
      tieneRiego: form.tieneRiego,
    });
    if (ok) {
      setForm(FORM_VACIO);
      setArea(null);
    }
  }

  const latNum = numeroOpcional(form.latitud);
  const lonNum = numeroOpcional(form.longitud);
  const valorMapa: AreaSeleccionadaDto | null =
    area ??
    (latNum !== undefined && lonNum !== undefined && Math.abs(latNum) <= 90 && Math.abs(lonNum) <= 180
      ? { tipo: "punto", latitud: latNum, longitud: lonNum }
      : null);

  const campo = "rounded border border-slate-300 px-3 py-2";

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Fincas</h1>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-base font-semibold text-slate-800">Registrar nueva finca (en cualquier lugar)</h2>
        <SelectorMapa valor={valorMapa} onCambio={onCambioMapa} altura="320px" />

        <form onSubmit={onSubmit} className="grid gap-2 pt-2 sm:grid-cols-2">
          <input value={form.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder="Nombre de la finca" className={campo} />
          <input value={form.localidad} onChange={(e) => cambiar("localidad", e.target.value)} placeholder="Localidad / vereda (opcional)" className={campo} />
          <input value={form.region} onChange={(e) => cambiar("region", e.target.value)} placeholder="Región / estado / departamento (opcional)" className={campo} />
          <input value={form.pais} onChange={(e) => cambiar("pais", e.target.value)} placeholder="País (opcional)" className={campo} />
          <input value={form.latitud} onChange={(e) => cambiar("latitud", e.target.value)} placeholder="Latitud (ej. 5.8269 o clic en mapa)" inputMode="decimal" className={campo} />
          <input value={form.longitud} onChange={(e) => cambiar("longitud", e.target.value)} placeholder="Longitud (ej. -73.0297 o clic en mapa)" inputMode="decimal" className={campo} />
          <input value={form.altitudM} onChange={(e) => cambiar("altitudM", e.target.value)} placeholder="Altitud en metros, -500 a 6000 (opcional)" inputMode="numeric" className={campo} />
          <select value={form.cultivoActual} onChange={(e) => cambiar("cultivoActual", e.target.value)} aria-label="Cultivo actual" className={campo}>
            <option value="">Sin registrar</option>
            {cultivos.map((c) => (
              <option key={c.clave} value={c.clave}>{c.nombre}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.tieneRiego} onChange={(e) => cambiar("tieneRiego", e.target.checked)} />
            La finca tiene riego
          </label>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">Registrar finca</button>
        </form>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {cargando && <p className="text-sm text-slate-500">Cargando…</p>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Nombre</th>
              <th className="py-2">Lugar</th>
              <th className="py-2">Área</th>
              <th className="py-2">Altitud</th>
              <th className="py-2">Cultivo actual</th>
              <th className="py-2">Riego</th>
            </tr>
          </thead>
          <tbody>
            {pagina?.items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="py-2">{item.nombre}</td>
                <td className="py-2">{[item.localidad, item.region, item.pais].filter(Boolean).join(", ") || "—"}</td>
                <td className="py-2">{item.areaHa !== null ? item.areaHa.toFixed(2) + " ha" : "—"}</td>
                <td className="py-2">{item.altitudM !== null ? item.altitudM + " m" : "Pendiente (SRTM)"}</td>
                <td className="py-2">{item.cultivoActual ?? "—"}</td>
                <td className="py-2">{item.tieneRiego ? "Sí" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
