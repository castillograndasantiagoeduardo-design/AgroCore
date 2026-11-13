/**
 * Herramientas MCP del módulo clima. ToolGateway valida, ejecuta y registra.
 */
import { MCP_TOOLS, PerfilClimaticoUbicacionSchema } from "@agrocore/contracts";
import type { ToolGateway } from "../tool-gateway.ts";

export function registrarClimaTools(gateway: ToolGateway): void {
  gateway.register({
    name: MCP_TOOLS.CLIMA_PERFIL_UBICACION,
    description:
      "Perfil climático de cualquier ubicación (latitud, longitud, altitud opcional; NASA POWER, últimos 30 años, corregido por altitud): " +
      "lluvia, temperaturas, probabilidad de helada y temporada de cada mes.",
    schema: PerfilClimaticoUbicacionSchema,
    execute: (input, container, contexto) =>
      container.obtenerPerfilClimatico.porUbicacion({ latitud: input.latitud, longitud: input.longitud, altitudM: input.altitudM ?? null }, contexto),
  });
}
