/**
 * Mapper: traduce filas SQL a la entidad Finca de core y viceversa.
 */
import { Finca, NombreFinca, UbicacionFinca } from "@agrocore/core";
import type { FincaRow, NuevoFincaRow } from "../schema/fincas.schema.ts";

export const FincaMapper = {
  toDomain(row: FincaRow): Finca {
    return Finca.reconstruir({
      id: row.id,
      nombre: NombreFinca.reconstruir(row.nombre),
      descripcion: row.descripcion,
      ubicacion: UbicacionFinca.reconstruir(row.latitud, row.longitud, row.altitudM),
      vereda: row.vereda,
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
      vereda: entidad.vereda,
      tieneRiego: entidad.tieneRiego,
      cultivoActual: entidad.cultivoActual,
      activo: entidad.activo,
    };
  },
};
