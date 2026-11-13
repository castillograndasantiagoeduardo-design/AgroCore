/**
 * createContainer: ÚNICO lugar donde se instancian repositorios, servicios y casos de uso (Regla 4).
 * No contiene ni una sola línea de lógica de negocio.
 */
import {
  createDatabase,
  MySqlAuditor,
  MySqlMcpToolLogger,
  MySqlUnitOfWork,
  MySqlFincaRepository,
  CatalogoCultivosEnMemoria,
} from "@duitamacrece/database";
import {
  IdeamNormalesClient,
  NasaPowerClient,
  SistemaReloj,
} from "@duitamacrece/platform";
import type { AppConfig } from "./config.ts";
import {
  CrearFincaUseCase,
  ListarFincasUseCase,
  ObtenerPerfilClimaticoUseCase,
  ListarCultivosUseCase,
  ObtenerCultivoUseCase,
  CompararRotacionesUseCase,
} from "@duitamacrece/core";
// @scaffold:imports

export function createContainer(config: AppConfig) {
  const db = createDatabase(config.db);

  // Adaptadores transversales
  const auditor = new MySqlAuditor(db);
  const unitOfWork = new MySqlUnitOfWork(db);
  const mcpToolLogger = new MySqlMcpToolLogger(db);
  const climaProvider = new NasaPowerClient();
  const normalesProvider = new IdeamNormalesClient({ departamentos: ["Boyacá"] });
  const reloj = new SistemaReloj();

  // Repositorios
  const fincaRepository = new MySqlFincaRepository(db);
  const cultivoRepository = new CatalogoCultivosEnMemoria(); // Fail-Fast: valida el catálogo al arrancar
  // @scaffold:repositories

  // Casos de uso que otros casos de uso consumen a través de un puerto
  const obtenerPerfilClimatico = new ObtenerPerfilClimaticoUseCase(fincaRepository, climaProvider, normalesProvider, reloj);

  return {
    mcpToolLogger,
    // Casos de uso
    crearFinca: new CrearFincaUseCase(fincaRepository, unitOfWork, auditor, cultivoRepository),
    listarFincas: new ListarFincasUseCase(fincaRepository),
    obtenerPerfilClimatico,
    listarCultivos: new ListarCultivosUseCase(cultivoRepository),
    obtenerCultivo: new ObtenerCultivoUseCase(cultivoRepository),
    compararRotaciones: new CompararRotacionesUseCase(fincaRepository, cultivoRepository, obtenerPerfilClimatico),
    // @scaffold:use-cases
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
