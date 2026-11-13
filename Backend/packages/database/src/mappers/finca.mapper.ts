/**
 * Mapper: traduce filas SQL a la entidad Finca de core y viceversa.
 */
import { AreaSeleccionada, Finca, NombreFinca, UbicacionFinca } from "@agrocore/core";
import type { FincaRow, NuevoFincaRow } from "../schema/fincas.schema.ts";

export const FincaMapper = {
  toDomain(row: FincaRow): Finca {
    // El polígono se validó al crear la finca; si una fila antigua trae uno inválido, se ignora.
    const area = row.areaGeojson ? AreaSeleccionada.poligono(row.areaGeojson) : null;
    return Finca.reconstruir({
      id: row.id,
      nombre: NombreFinca.reconstruir(row.nombre),
      descripcion: row.descripcion,
      ubicacion: UbicacionFinca.reconstruir(row.latitud, row.longitud, row.altitudM),
      area: area && area.ok ? area.value : null,
      localidad: row.localidad,
      pais: row.pais,
      region: row.region,
      tieneRiego: row.tieneRiego,
      cultivoActual: row.cultivoActual,
      activo: row.activo,
      creadoEn: row.creadoEn,
    });
  },

  toPersistence(entidad: Finca): NuevoFincaRow {
    return {
      nombre: entidad.nombre,
      descripcion: entidad.descripcion,
      latitud: entidad.ubicacion.latitud,
      longitud: entidad.ubicacion.longitud,
      altitudM: entidad.ubicacion.altitudM,
      areaGeojson: entidad.area?.toGeoJson() ?? null,
      localidad: entidad.localidad,
      pais: entidad.pais,
      region: entidad.region,
      tieneRiego: entidad.tieneRiego,
      cultivoActual: entidad.cultivoActual,
      activo: entidad.activo,
    };
  },
};
