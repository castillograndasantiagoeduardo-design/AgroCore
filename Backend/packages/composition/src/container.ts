/**
 * createContainer: ÚNICO lugar donde se instancian repositorios, servicios y casos de uso (Regla 4).
 * No contiene ni una sola línea de lógica de negocio.
 */
import {
  CatalogoCultivosEnMemoria,
  createDatabase,
  MySqlAuditor,
  MySqlCacheProveedores,
  MySqlClimaPrecalculado,
  MySqlCoberturaRegion,
  MySqlElevacionRegion,
  MySqlFincaRepository,
  MySqlMcpToolLogger,
  MySqlPrecalculo,
  MySqlViasRegion,
  MySqlUnitOfWork,
} from "@agrocore/database";
import {
  ClimaPrecalculadoOVivo,
  CoberturaRegionalOVivo,
  ElevacionRegionalOVivo,
  EscPosWindowsPrinter,
  IdeamNormalesClient,
  MedidorTiemposAls,
  NasaPowerClimatologiaClient,
  PresenciaLocalClient,
  TemporizadorSistema,
  NasaPowerClient,
  NasaPowerHumedadClient,
  OpenTopoDataElevacionClient,
  OrnlModisClient,
  OverpassViasClient,
  puntoEnCaja,
  SistemaReloj,
  SoilGridsClient,
  ViasRegionalOVivo,
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
  RecomendacionDetalleUseCase,
  RecomendarPorEpocaUseCase,
} from "@agrocore/core";
// @scaffold:imports

/** Opciones de ensamblaje (scripts de medición). */
export interface OpcionesContenedor {
  /** true = sin caché MySQL de proveedores (para medir en frío sin borrar nada). */
  sinCachePersistente?: boolean;
  /** true = ignora el precálculo regional (MySQL) y usa siempre los proveedores en vivo (para medir en frío). */
  sinPrecalculo?: boolean;
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
  const climaVivo = new NasaPowerClient({ cache });
  const climatologiaProvider = new NasaPowerClimatologiaClient({ cache });
  const presenciaProvider = new PresenciaLocalClient();
  const temporizador = new TemporizadorSistema();
  const normalesProvider = new IdeamNormalesClient({ departamentos: ["Boyacá"] });
  const viasVivo = new OverpassViasClient({ cache });
  const modis = new OrnlModisClient({ cache });
  const sueloProvider = new SoilGridsClient({ cache });
  const elevacionVivo = new OpenTopoDataElevacionClient({ cache });
  const humedadProvider = new NasaPowerHumedadClient({ cache });
  const impresora = new EscPosWindowsPrinter({
    impresoraCompartida: config.impresora.compartida,
    codepage: config.impresora.codepage,
    cortar: config.impresora.cortar,
  });

  // Precálculo regional (MySQL): dentro de la región precalculada la etapa rápida no llama a proveedores externos.
  // Los decoradores usan el proveedor regional si cubre la consulta y, si no, el proveedor en vivo.
  const precalculo = new MySqlPrecalculo(db);
  const usarPrecalculo = !opciones.sinPrecalculo;
  const climaProvider = usarPrecalculo ? new ClimaPrecalculadoOVivo(new MySqlClimaPrecalculado(db), climaVivo) : climaVivo;
  const viasProvider = usarPrecalculo ? new ViasRegionalOVivo(new MySqlViasRegion(db), viasVivo) : viasVivo;
  const coberturaProvider = usarPrecalculo ? new CoberturaRegionalOVivo(new MySqlCoberturaRegion(db), modis) : modis;
  const elevacionProvider = usarPrecalculo ? new ElevacionRegionalOVivo(new MySqlElevacionRegion(db), elevacionVivo) : elevacionVivo;
  /** true si el punto cae en la región "detalle" del precálculo (sirve para rotular origen: "precalculo"). */
  const enRegionPrecalculada = (latitud: number, longitud: number): boolean =>
    usarPrecalculo && puntoEnCaja(latitud, longitud, config.regionPrecalculo.detalle);

  // Repositorios
  const fincaRepository = new MySqlFincaRepository(db);
  const cultivoRepository = new CatalogoCultivosEnMemoria(); // Fail-Fast: valida el catálogo al arrancar
  // @scaffold:repositories

  // Casos de uso que otros casos de uso consumen a través de un puerto
  const obtenerPerfilClimatico = new ObtenerPerfilClimaticoUseCase(fincaRepository, climaProvider, normalesProvider, reloj, medidor, climatologiaProvider, temporizador);
  const analizarTerreno = new AnalizarTerrenoUseCase({
    vias: viasProvider,
    cobertura: coberturaProvider,
    ndvi: modis,
    suelo: sueloProvider,
    elevacion: elevacionProvider,
    humedad: humedadProvider,
    reloj,
    medidor,
  });

  const motorRotaciones = new MotorRotaciones(cultivoRepository, obtenerPerfilClimatico, analizarTerreno, medidor);
  const compararRotacionesUbicacion = new CompararRotacionesUbicacionUseCase(motorRotaciones);
  const recomendacionRapida = new RecomendarPorEpocaUseCase({
    vias: viasProvider,
    cobertura: coberturaProvider,
    elevacion: elevacionProvider,
    clima: obtenerPerfilClimatico,
    presencia: presenciaProvider,
    cultivos: cultivoRepository,
    temporizador,
    reloj,
    medidor,
    enRegionPrecalculada,
  });
  const recomendacionDetalle = new RecomendacionDetalleUseCase({
    terreno: analizarTerreno,
    clima: obtenerPerfilClimatico,
    presencia: presenciaProvider,
    cultivos: cultivoRepository,
    motor: motorRotaciones,
    temporizador,
    reloj,
  });

  return {
    mcpToolLogger,
    medidor,
    enRegionPrecalculada,
    /** Herramientas del script de precálculo (scripts/precalcular-region.ts): región, escritura y descargas. */
    precalculo: {
      region: config.regionPrecalculo,
      repositorio: precalculo,
      /** Cliente de NASA POWER NUEVO (sin caché de errores) con timeout largo para la serie de 30 años. */
      crearClimaVivo: () => new NasaPowerClient({ timeoutMs: 120_000 }),
      presencia: presenciaProvider,
    },
    // Casos de uso
    crearFinca: new CrearFincaUseCase(fincaRepository, unitOfWork, auditor, cultivoRepository),
    listarFincas: new ListarFincasUseCase(fincaRepository),
    obtenerPerfilClimatico,
    listarCultivos: new ListarCultivosUseCase(cultivoRepository),
    obtenerCultivo: new ObtenerCultivoUseCase(cultivoRepository),
    compararRotaciones: new CompararRotacionesUseCase(fincaRepository, motorRotaciones),
    compararRotacionesUbicacion,
    analizarTerreno,
    recomendacionRapida,
    recomendacionDetalle,
    imprimirTicketTerreno: new ImprimirTicketTerrenoUseCase(recomendacionRapida, impresora, reloj),
    // @scaffold:use-cases
  };
}

export type AppContainer = ReturnType<typeof createContainer>;
