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
  IdeamNormalesClient,
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
  CompararRotacionesUseCase,
  CrearFincaUseCase,
  ListarCultivosUseCase,
  ListarFincasUseCase,
  ObtenerCultivoUseCase,
  ObtenerPerfilClimaticoUseCase,
} from "@agrocore/core";
// @scaffold:imports

export function createContainer(config: AppConfig) {
  const db = createDatabase(config.db);

  // Adaptadores transversales
  const auditor = new MySqlAuditor(db);
  const unitOfWork = new MySqlUnitOfWork(db);
  const mcpToolLogger = new MySqlMcpToolLogger(db);
  const cache = new MySqlCacheProveedores(db); // caché persistente de proveedores externos (tabla cache_proveedores)
  const reloj = new SistemaReloj();

  // Proveedores externos (platform)
  const climaProvider = new NasaPowerClient({ cache });
  const normalesProvider = new IdeamNormalesClient({ departamentos: ["Boyacá"] });
  const viasProvider = new OverpassViasClient({ cache });
  const modis = new OrnlModisClient({ cache });
  const sueloProvider = new SoilGridsClient({ cache });
  const elevacionProvider = new OpenTopoDataElevacionClient({ cache });
  const humedadProvider = new NasaPowerHumedadClient({ cache });

  // Repositorios
  const fincaRepository = new MySqlFincaRepository(db);
  const cultivoRepository = new CatalogoCultivosEnMemoria(); // Fail-Fast: valida el catálogo al arrancar
  // @scaffold:repositories

  // Casos de uso que otros casos de uso consumen a través de un puerto
  const obtenerPerfilClimatico = new ObtenerPerfilClimaticoUseCase(fincaRepository, climaProvider, normalesProvider, reloj);
  const analizarTerreno = new AnalizarTerrenoUseCase({
    vias: viasProvider,
    cobertura: modis,
    ndvi: modis,
    suelo: sueloProvider,
    elevacion: elevacionProvider,
    humedad: humedadProvider,
    reloj,
  });

  return {
    mcpToolLogger,
    // Casos de uso
    crearFinca: new CrearFincaUseCase(fincaRepository, unitOfWork, auditor, cultivoRepository),
    listarFincas: new ListarFincasUseCase(fincaRepository),
    obtenerPerfilClimatico,
    listarCultivos: new ListarCultivosUseCase(cultivoRepository),
    obtenerCultivo: new ObtenerCultivoUseCase(cultivoRepository),
    compararRotaciones: new CompararRotacionesUseCase(fincaRepository, cultivoRepository, obtenerPerfilClimatico),
    analizarTerreno,
    // @scaffold:use-cases
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
