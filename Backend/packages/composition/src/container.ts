/**
 * createContainer: ÚNICO lugar donde se instancian repositorios, servicios y casos de uso (Regla 4).
 * No contiene ni una sola línea de lógica de negocio.
 */
import {
  CatalogoCultivosEnMemoria,
  createDatabase,
  MySqlAuditor,
  MySqlCacheProveedores,
  MySqlFincaRepository,
  MySqlMcpToolLogger,
  MySqlUnitOfWork,
} from "@agrocore/database";
import {
  EscPosWindowsPrinter,
  IdeamNormalesClient,
  MedidorTiemposAls,
  NasaPowerClient,
  NasaPowerHumedadClient,
  OpenTopoDataElevacionClient,
  OrnlModisClient,
  OverpassViasClient,
  SistemaReloj,
  SoilGridsClient,
} from "@agrocore/platform";
import type { AppConfig } from "./config.ts";
import {
  AnalizarTerrenoUseCase,
  CompararRotacionesUbicacionUseCase,
  CompararRotacionesUseCase,
  MotorRotaciones,
  CrearFincaUseCase,
  ImprimirTicketTerrenoUseCase,
  ListarCultivosUseCase,
  ListarFincasUseCase,
  ObtenerCultivoUseCase,
  ObtenerPerfilClimaticoUseCase,
} from "@agrocore/core";
// @scaffold:imports

/** Opciones de ensamblaje (scripts de medición). */
export interface OpcionesContenedor {
  /** true = sin caché MySQL de proveedores (para medir en frío sin borrar nada). */
  sinCachePersistente?: boolean;
}

export function createContainer(config: AppConfig, opciones: OpcionesContenedor = {}) {
  const db = createDatabase(config.db);

  // Adaptadores transversales
  const auditor = new MySqlAuditor(db);
  const unitOfWork = new MySqlUnitOfWork(db);
  const mcpToolLogger = new MySqlMcpToolLogger(db);
  const cache = opciones.sinCachePersistente ? undefined : new MySqlCacheProveedores(db); // caché persistente de proveedores externos (tabla cache_proveedores)
  const medidor = new MedidorTiemposAls(); // Server-Timing y scripts/medir-tiempos.ts
  const reloj = new SistemaReloj();

  // Proveedores externos (platform)
  const climaProvider = new NasaPowerClient({ cache });
  const normalesProvider = new IdeamNormalesClient({ departamentos: ["Boyacá"] });
  const viasProvider = new OverpassViasClient({ cache });
  const modis = new OrnlModisClient({ cache });
  const sueloProvider = new SoilGridsClient({ cache });
  const elevacionProvider = new OpenTopoDataElevacionClient({ cache });
  const humedadProvider = new NasaPowerHumedadClient({ cache });
  const impresora = new EscPosWindowsPrinter({
    impresoraCompartida: config.impresora.compartida,
    codepage: config.impresora.codepage,
    cortar: config.impresora.cortar,
  });

  // Repositorios
  const fincaRepository = new MySqlFincaRepository(db);
  const cultivoRepository = new CatalogoCultivosEnMemoria(); // Fail-Fast: valida el catálogo al arrancar
  // @scaffold:repositories

  // Casos de uso que otros casos de uso consumen a través de un puerto
  const obtenerPerfilClimatico = new ObtenerPerfilClimaticoUseCase(fincaRepository, climaProvider, normalesProvider, reloj, medidor);
  const analizarTerreno = new AnalizarTerrenoUseCase({
    vias: viasProvider,
    cobertura: modis,
    ndvi: modis,
    suelo: sueloProvider,
    elevacion: elevacionProvider,
    humedad: humedadProvider,
    reloj,
    medidor,
  });

  const motorRotaciones = new MotorRotaciones(cultivoRepository, obtenerPerfilClimatico, analizarTerreno, medidor);
  const compararRotacionesUbicacion = new CompararRotacionesUbicacionUseCase(motorRotaciones);

  return {
    mcpToolLogger,
    medidor,
    // Casos de uso
    crearFinca: new CrearFincaUseCase(fincaRepository, unitOfWork, auditor, cultivoRepository),
    listarFincas: new ListarFincasUseCase(fincaRepository),
    obtenerPerfilClimatico,
    listarCultivos: new ListarCultivosUseCase(cultivoRepository),
    obtenerCultivo: new ObtenerCultivoUseCase(cultivoRepository),
    compararRotaciones: new CompararRotacionesUseCase(fincaRepository, motorRotaciones),
    compararRotacionesUbicacion,
    analizarTerreno,
    imprimirTicketTerreno: new ImprimirTicketTerrenoUseCase(analizarTerreno, compararRotacionesUbicacion, impresora, reloj),
    // @scaffold:use-cases
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
