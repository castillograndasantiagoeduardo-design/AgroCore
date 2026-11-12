"use client";

/**
 * Vista del módulo fincas: formulario de registro + tabla.
 * (Más adelante el formulario de coordenadas se reemplaza por un clic en el mapa de Duitama.)
 */
import { type FormEvent, useEffect, useState } from "react";
import type { CultivoDto, ZonaAltitudinal } from "@duitamacrece/contracts";
import { cultivosApi } from "@/features/cultivos/api/cultivos.api";
import { useFincas } from "../hooks/use-fincas";
import { SelectorMapa } from "./SelectorMapa";

const FORM_VACIO = {
  nombre: "",
  latitud: "",
  longitud: "",
  altitudM: "",
  vereda: "",
  cultivoActual: "",
  tieneRiego: false,
};

const ETIQUETA_ZONA: Record<ZonaAltitudinal, string> = {
  valle: "Valle (< 2.600 m)",
  ladera: "Ladera (2.600–3.000 m)",
  alta: "Alta (> 3.000 m)",
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

  function onSelectCoordenadas(lat: number, lon: number) {
    cambiar("latitud", String(lat));
    cambiar("longitud", String(lon));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await crear({
      nombre: form.nombre,
      latitud: numeroOpcional(form.latitud) ?? NaN,
      longitud: numeroOpcional(form.longitud) ?? NaN,
      altitudM: numeroOpcional(form.altitudM),
      vereda: textoOpcional(form.vereda),
      cultivoActual: textoOpcional(form.cultivoActual),
      tieneRiego: form.tieneRiego,
    });
    if (ok) setForm(FORM_VACIO);
  }

  const campo = "rounded border border-slate-300 px-3 py-2";

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Fincas de Duitama</h1>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-base font-semibold text-slate-800">Registrar nueva finca</h2>
        <SelectorMapa
          latitud={numeroOpcional(form.latitud)}
          longitud={numeroOpcional(form.longitud)}
          onSelectCoordenadas={onSelectCoordenadas}
          altura="280px"
        />

        <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-2 pt-2">
          <input value={form.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder="Nombre de la finca" className={campo} />
          <input value={form.vereda} onChange={(e) => cambiar("vereda", e.target.value)} placeholder="Vereda (opcional)" className={campo} />
          <input value={form.latitud} onChange={(e) => cambiar("latitud", e.target.value)} placeholder="Latitud (ej. 5.8269 o clic en mapa)" inputMode="decimal" className={campo} />
          <input value={form.longitud} onChange={(e) => cambiar("longitud", e.target.value)} placeholder="Longitud (ej. -73.0297 o clic en mapa)" inputMode="decimal" className={campo} />
          <input value={form.altitudM} onChange={(e) => cambiar("altitudM", e.target.value)} placeholder="Altitud en metros (opcional)" inputMode="numeric" className={campo} />
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
              <th className="py-2">Vereda</th>
              <th className="py-2">Altitud</th>
              <th className="py-2">Zona</th>
              <th className="py-2">Cultivo actual</th>
              <th className="py-2">Riego</th>
            </tr>
          </thead>
          <tbody>
            {pagina?.items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="py-2">{item.nombre}</td>
                <td className="py-2">{item.vereda ?? "—"}</td>
                <td className="py-2">{item.altitudM !== null ? item.altitudM + " m" : "Pendiente (SRTM)"}</td>
                <td className="py-2">{item.zonaAltitudinal ? ETIQUETA_ZONA[item.zonaAltitudinal] : "—"}</td>
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
