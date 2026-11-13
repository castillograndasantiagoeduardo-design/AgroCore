/**
 * Vista del ticket de 58 mm (48 mm útiles, monoespaciada). El CSS de impresión vive en app/globals.css
 * (bloque "impresión térmica"): al imprimir solo se ve este elemento.
 */
import type { ComparacionRotacionesDto, LineaTicketDto, PerfilTerrenoDto } from "@agrocore/contracts";

const NOMBRE_MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const SEPARADOR: LineaTicketDto = { texto: "-".repeat(32), estilo: "separador" };

/** Compone un resumen con los datos ya cargados (cuando no hay backend de impresión). */
export function componerTicketLocal(comparacion: ComparacionRotacionesDto | null, perfil: PerfilTerrenoDto | null): LineaTicketDto[] {
  const ubi = comparacion?.sitio.ubicacion ?? perfil?.ubicacion;
  const lineas: LineaTicketDto[] = [{ texto: "AGROCORE", estilo: "titulo" }, { texto: "Analisis de terreno", estilo: "centrado" }, SEPARADOR];
  if (ubi) {
    lineas.push({ texto: `Lat ${ubi.latitud.toFixed(5)}`, estilo: "normal" }, { texto: `Lon ${ubi.longitud.toFixed(5)}`, estilo: "normal" });
    if (ubi.areaHa !== null) lineas.push({ texto: `Area ${ubi.areaHa.toFixed(2)} ha`, estilo: "normal" });
  }
  const aptitud = comparacion?.terreno.mensajeAptitud ?? perfil?.mensajeAptitud;
  if (aptitud) lineas.push({ texto: aptitud, estilo: "negrita" });
  if (perfil?.suelo) {
    lineas.push(SEPARADOR, { texto: "SUELO", estilo: "negrita" });
    if (perfil.suelo.textura) lineas.push({ texto: `Textura ${perfil.suelo.textura}`, estilo: "normal" });
    if (perfil.suelo.ph !== null) lineas.push({ texto: `pH ${perfil.suelo.ph.toFixed(1)}`, estilo: "normal" });
  }
  if (perfil?.elevacionM != null) lineas.push({ texto: `Elevacion ${Math.round(perfil.elevacionM)} m`, estilo: "normal" });
  if (perfil?.pendientePct != null) lineas.push({ texto: `Pendiente ${perfil.pendientePct.toFixed(1)} %`, estilo: "normal" });
  if (comparacion) {
    lineas.push(
      SEPARADOR,
      { texto: "CLIMA", estilo: "negrita" },
      { texto: `Lluvia ${Math.round(comparacion.clima.lluviaAnualMm)} mm/anio`, estilo: "normal" },
      { texto: `Clima ${comparacion.sitio.clasificacionClimatica}`, estilo: "normal" },
      SEPARADOR,
      { texto: "ESTRATEGIAS", estilo: "negrita" },
    );
    for (const e of comparacion.estrategias) {
      const mejor = e.id === comparacion.estrategiaMejorPuntuada ? " *" : "";
      lineas.push({ texto: `${e.id}) ${e.nombre} ${Math.round(e.puntajeTotal)}${mejor}`, estilo: "normal" });
      lineas.push({ texto: e.secuencia.map((p) => `${p.cultivoNombre} ${NOMBRE_MES_CORTO[p.mesSiembra - 1]}`).join(" > "), estilo: "normal" });
    }
    lineas.push(SEPARADOR, { texto: "(*) mejor puntaje", estilo: "normal" });
  }
  lineas.push(SEPARADOR, { texto: "Sugerencia con datos; consulte a su agronomo.", estilo: "centrado" });
  return lineas;
}

const CLASE_ESTILO: Record<LineaTicketDto["estilo"], string> = {
  titulo: "ticket-titulo",
  negrita: "ticket-negrita",
  normal: "",
  separador: "ticket-separador",
  centrado: "ticket-centrado",
};

export function TicketImprimible({ lineas }: { lineas: LineaTicketDto[] }) {
  return (
    <div className="ticket-imprimible" aria-label="Vista previa del ticket de 58 mm">
      {lineas.map((l, i) =>
        l.estilo === "separador" ? (
          <hr key={i} className="ticket-separador" />
        ) : (
          <p key={i} className={CLASE_ESTILO[l.estilo]}>
            {l.texto}
          </p>
        ),
      )}
    </div>
  );
}
