/**
 * Convierte la presencia local del puerto (EVA / FAOSTAT) en la PresenciaMotor que usan el motor y la recomendación.
 *   local       área > 0 en la zona
 *   poco_comun  la fuente cubre el cultivo pero no aparece en la zona
 *   sin_datos   la fuente no cubre el cultivo, o no hay fuente / no respondió
 * El valor por hectárea es el del país (FAOSTAT) y, si no hay, el promedio mundial del catálogo (FAOSTAT).
 */
import type { DatoConFuente, PresenciaLocalDto } from "@agrocore/contracts";
import type { Cultivo } from "../../cultivos/domain/entities/cultivo.entity.ts";
import { PRESENCIA_DESCONOCIDA, type PresenciaMotor } from "../../rotaciones/domain/services/presencia-motor.ts";
import type { PresenciaLocal } from "./ports/index.ts";

export function crearPresenciaMotor(p: PresenciaLocal | null, catalogo: readonly Cultivo[]): PresenciaMotor {
  const porClave = new Map(catalogo.map((c) => [c.clave, c]));
  const valorMundo = (clave: string): DatoConFuente<number> =>
    porClave.get(clave)?.valorProduccionHa ?? PRESENCIA_DESCONOCIDA.valorHa(clave);
  if (!p) return { ...PRESENCIA_DESCONOCIDA, valorHa: valorMundo };
  return {
    disponible: true,
    nivel: (clave) => ((p.areaPorCultivo[clave] ?? 0) > 0 ? "local" : p.cultivosCubiertos.includes(clave) ? "poco_comun" : "sin_datos"),
    areaHa: (clave) => {
      const a = p.areaPorCultivo[clave];
      return {
        valor: a !== undefined && a > 0 ? a : null,
        unidad: "ha",
        fuente: p.fuente,
        tipo: "medido",
        fecha: p.periodo,
        nota: (p.fuente === "EVA" ? "Área sembrada promedio por año en " : "Área cosechada promedio por año en ") + p.ambito,
      };
    },
    valorHa: (clave) => {
      const v = p.valorProduccionHaPais[clave];
      if (v !== undefined) {
        return {
          valor: v,
          unidad: "I$/ha",
          fuente: "FAOSTAT",
          tipo: "referencia",
          fecha: "2018-2022",
          nota: "Valor bruto de la producción por hectárea en " + (p.pais ?? "el país") + " (I$ constantes 2014-2016); no descuenta costos",
        };
      }
      return valorMundo(clave);
    },
  };
}

/** Presencia para la respuesta (lista de cultivos del catálogo presentes, con su área como DatoConFuente). */
export function presenciaDto(p: PresenciaLocal | null, motor: PresenciaMotor, catalogo: readonly Cultivo[], disponible: boolean): PresenciaLocalDto | null {
  if (!p) return null;
  return {
    fuente: p.fuente,
    ambito: p.ambito,
    periodo: p.periodo,
    disponible,
    cultivos: catalogo
      .filter((c) => motor.nivel(c.clave) === "local")
      .map((c) => ({ clave: c.clave, nombre: c.nombre, areaHa: motor.areaHa(c.clave) }))
      .sort((a, b) => (b.areaHa.valor ?? 0) - (a.areaHa.valor ?? 0)),
    ...(p.nota ? { nota: p.nota } : {}),
  };
}
