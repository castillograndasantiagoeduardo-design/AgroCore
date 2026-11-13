/**
 * Tests del módulo clima con datos sintéticos (sin internet ni MySQL).
 */
import { assertAlmostEquals, assertEquals } from "@std/assert";
import { type DomainError, type Paginated, Result } from "@agrocore/shared-kernel";
import {
  calcularAjusteTemperatura,
  calcularCalendarioMensual,
  ClimaProveedorNoDisponibleError,
  Finca,
  type IClimaProvider,
  type IFincaRepository,
  type INormalesClimatologicasProvider,
  aplicarCalibracion,
  calcularFactoresCalibracion,
  distanciaKm,
  type NormalClimatologica,
  NombreFinca,
  ObtenerPerfilClimaticoUseCase,
  type RegistroClimaDiario,
  UbicacionFinca,
  type ContextoSolicitud,
} from "../../src/index.ts";

// ---------------------------------------------------------------------------
// Datos sintéticos: clima bimodal "tipo Duitama"
//   - Lluvia diaria alta en abr-may y oct-nov; baja en dic-feb y jul-ago.
//   - Tmin de enero = 1 °C (helada); resto de meses = 7 °C.
// ---------------------------------------------------------------------------
const LLUVIA_DIARIA_POR_MES = [0.5, 1, 2, 4, 4, 2, 1, 1, 2, 4, 4, 1];
const TMIN_POR_MES = [1, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];

function serieSintetica(anioInicio: number, anios: number): RegistroClimaDiario[] {
  const registros: RegistroClimaDiario[] = [];
  for (let anio = anioInicio; anio < anioInicio + anios; anio++) {
    for (let mes = 0; mes < 12; mes++) {
      const diasMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
      for (let dia = 1; dia <= diasMes; dia++) {
        const tmin = TMIN_POR_MES[mes];
        registros.push({
          fecha: anio + "-" + String(mes + 1).padStart(2, "0") + "-" + String(dia).padStart(2, "0"),
          lluviaMm: dia === 15 && mes === 3 ? 25 : LLUVIA_DIARIA_POR_MES[mes], // un aguacero de 25 mm cada 15 de abril
          tempMinC: tmin,
          tempMediaC: tmin + 7,
          tempMaxC: tmin + 14,
        });
      }
    }
  }
  return registros;
}

class ClimaFalso implements IClimaProvider {
  consultas: { desde: string; hasta: string }[] = [];
  constructor(private readonly altitudCeldaM: number, private readonly registros = serieSintetica(1996, 30)) {}
  obtenerSerieDiaria(consulta: { latitud: number; longitud: number; desde: string; hasta: string }) {
    this.consultas.push({ desde: consulta.desde, hasta: consulta.hasta });
    return Promise.resolve(Result.ok({ fuente: "Falso", altitudCeldaM: this.altitudCeldaM, registros: this.registros }));
  }
}

function repoCon(fincas: Finca[]): IFincaRepository {
  return {
    buscarPorId: (id) => Promise.resolve(fincas.find((f) => f.id === id) ?? null),
    buscarPorNombre: () => Promise.resolve(null),
    listar: (): Promise<Paginated<Finca>> => Promise.resolve({ items: fincas, total: fincas.length, page: 1, pageSize: 20 }),
    guardar: (f) => Promise.resolve(f),
  };
}

function finca(id: number, altitudM: number | null): Finca {
  return Finca.reconstruir({
    id,
    nombre: NombreFinca.reconstruir("Finca " + id),
    descripcion: null,
    ubicacion: UbicacionFinca.reconstruir(5.8269, -73.0297, altitudM),
    vereda: null,
    tieneRiego: false,
    cultivoActual: "papa",
    activo: true,
    creadoEn: new Date(),
  });
}

const reloj = { hoy: () => new Date("2026-11-12T00:00:00Z") };
const actor: ContextoSolicitud = { origen: "script", ip: null };

/** Proveedor IDEAM sin estaciones cerca. */
const sinEstacion: INormalesClimatologicasProvider = { estacionMasCercana: () => Promise.resolve(Result.ok(null)) };

/**
 * Normal IDEAM sintética, comparada con la serie sintética de arriba:
 *  - llueve la MITAD que lo que dice la "NASA" (factor 0,5)
 *  - la Tmin es 6 °C MÁS FRÍA en julio (1 °C en vez de 7 °C) y igual el resto del año.
 */
function normalSintetica(): NormalClimatologica {
  return {
    fuente: "IDEAM falso",
    codigoEstacion: "24035120",
    estacion: "Estación de prueba",
    municipio: "Duitama",
    latitud: 5.80,
    longitud: -73.07,
    altitudM: 2515,
    anioInicio: 1996,
    anioFin: 2025,
    meses: LLUVIA_DIARIA_POR_MES.map((lluvia, i) => {
      const diasMes = new Date(Date.UTC(2001, i + 1, 0)).getUTCDate(); // año no bisiesto
      const tmin = i === 6 ? 1 : TMIN_POR_MES[i];
      const lluviaNasa = lluvia * diasMes + (i === 3 ? 25 - lluvia : 0);
      return { mes: i + 1, lluviaMm: lluviaNasa / 2, tempMinC: tmin, tempMediaC: TMIN_POR_MES[i] + 7, tempMaxC: TMIN_POR_MES[i] + 14 };
    }),
  };
}

function conEstacion(distanciaKm: number): INormalesClimatologicasProvider {
  return { estacionMasCercana: () => Promise.resolve(Result.ok({ normal: normalSintetica(), distanciaKm })) };
}

// ---------------------------------------------------------------------------
// Corrección por altitud
// ---------------------------------------------------------------------------
Deno.test("Corrección por altitud: 300 m más arriba ≈ 1,95 °C más frío", () => {
  assertAlmostEquals(calcularAjusteTemperatura(2500, 2800), -1.95, 1e-9);
});

Deno.test("Corrección por altitud: 200 m más abajo ≈ 1,3 °C más cálido", () => {
  assertAlmostEquals(calcularAjusteTemperatura(2700, 2500), 1.3, 1e-9);
});

// ---------------------------------------------------------------------------
// Calendario mensual
// ---------------------------------------------------------------------------
Deno.test("Calendario: enero tiene helada todos los años y abril es lluvioso", () => {
  const meses = calcularCalendarioMensual(serieSintetica(1996, 30), 0);

  assertEquals(meses.length, 12);
  assertEquals(meses[0].probabilidadHelada, 1); // enero: Tmin 1 °C ≤ 2 °C
  assertEquals(meses[0].diasHeladaPromedio, 31);
  assertEquals(meses[6].probabilidadHelada, 0); // julio: Tmin 7 °C
  assertEquals(meses[3].temporada, "lluviosa"); // abril
  assertEquals(meses[0].temporada, "seca"); // enero
  assertEquals(meses[3].diasLluviaFuertePromedio, 1); // el aguacero del 15 de abril
});

Deno.test("Calendario: una finca 900 m más alta convierte julio (7 °C) en mes de helada", () => {
  const ajuste = calcularAjusteTemperatura(2500, 3400); // −5,85 °C → Tmin julio ≈ 1,15 °C
  const meses = calcularCalendarioMensual(serieSintetica(1996, 30), ajuste);
  assertEquals(meses[6].probabilidadHelada, 1);
});

Deno.test("Calendario: sin datos suficientes devuelve vacío", () => {
  assertEquals(calcularCalendarioMensual(serieSintetica(1996, 30).slice(0, 100), 0), []);
});

// ---------------------------------------------------------------------------
// Caso de uso
// ---------------------------------------------------------------------------
Deno.test("Perfil climático: consulta los últimos 30 años completos", async () => {
  const clima = new ClimaFalso(2515);
  const uc = new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, 2515)]), clima, sinEstacion, reloj);

  const r = await uc.execute({ fincaId: 1 }, actor);

  assertEquals(r.ok, true);
  assertEquals(clima.consultas[0], { desde: "1996-01-01", hasta: "2025-12-31" });
  if (r.ok) {
    assertEquals(r.value.meses.length, 12);
    assertEquals(r.value.ajusteTemperaturaC, 0);
    assertEquals(r.value.resumen.mesesRiesgoHelada, [1]);
    assertEquals(r.value.resumen.mesesLluviosos, [4, 5, 10, 11]);
  }
});

Deno.test("Perfil climático: finca alta recibe corrección negativa y advertencia", async () => {
  const uc = new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, 3100)]), new ClimaFalso(2515), sinEstacion, reloj);
  const r = await uc.execute({ fincaId: 1 }, actor);

  assertEquals(r.ok, true);
  if (r.ok) {
    assertAlmostEquals(r.value.ajusteTemperaturaC, -3.8, 0.01); // (2515 − 3100) × 0,0065
    assertEquals(r.value.advertencias.some((a) => a.includes("aproximada")), true);
  }
});

Deno.test("Perfil climático: finca sin altitud usa la de la celda y lo advierte", async () => {
  const uc = new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, null)]), new ClimaFalso(2515), sinEstacion, reloj);
  const r = await uc.execute({ fincaId: 1 }, actor);

  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.altitudReferenciaM, 2515);
    assertEquals(r.value.ajusteTemperaturaC, 0);
    assertEquals(r.value.advertencias.some((a) => a.startsWith("La finca no tiene altitud")), true);
  }
});

Deno.test("Perfil climático: finca inexistente → FINCA_NO_ENCONTRADO", async () => {
  const uc = new ObtenerPerfilClimaticoUseCase(repoCon([]), new ClimaFalso(2515), sinEstacion, reloj);
  const r = await uc.execute({ fincaId: 99 }, actor);

  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "FINCA_NO_ENCONTRADO");
});

Deno.test("Perfil climático: proveedor caído → CLIMA_PROVEEDOR_NO_DISPONIBLE", async () => {
  const caido: IClimaProvider = {
    obtenerSerieDiaria: () =>
      Promise.resolve(Result.err(new ClimaProveedorNoDisponibleError("NASA POWER", "timeout")) as Result<never, DomainError>),
  };
  const uc = new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, 2515)]), caido, sinEstacion, reloj);
  const r = await uc.execute({ fincaId: 1 }, actor);

  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "CLIMA_PROVEEDOR_NO_DISPONIBLE");
});

Deno.test("Perfil climático: proveedor sin datos → CLIMA_SIN_DATOS", async () => {
  const uc = new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, 2515)]), new ClimaFalso(2515, []), sinEstacion, reloj);
  const r = await uc.execute({ fincaId: 1 }, actor);

  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "CLIMA_SIN_DATOS");
});

// ---------------------------------------------------------------------------
// Calibración con IDEAM
// ---------------------------------------------------------------------------
Deno.test("Calibración: distancia Duitama centro → Surbatá-Bonza ≈ 5,5 km", () => {
  assertAlmostEquals(distanciaKm(5.8269, -73.0297, 5.8024, -73.0745), 5.6, 0.2);
});

Deno.test("Calibración: factores = IDEAM − NASA (temperatura) e IDEAM ÷ NASA (lluvia)", () => {
  const factores = calcularFactoresCalibracion(normalSintetica(), serieSintetica(1996, 30), 0)!;

  assertEquals(factores.length, 12);
  assertAlmostEquals(factores[6].deltaTminC, -6, 0.05); // julio: 1 °C real vs 7 °C NASA
  assertAlmostEquals(factores[0].deltaTminC, 0, 0.05); // enero: igual
  assertAlmostEquals(factores[3].factorLluvia, 0.5, 0.01); // la NASA dobla la lluvia
});

Deno.test("Calibración: se aplica día por día según el mes", () => {
  const dia = [{ fecha: "2020-07-10", lluviaMm: 10, tempMinC: 7, tempMediaC: 14, tempMaxC: 21 }];
  const factores = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1, deltaTminC: i === 6 ? -6 : 0, deltaTmediaC: 0, deltaTmaxC: 0, factorLluvia: 0.5,
  }));
  const [r] = aplicarCalibracion(dia, factores);

  assertEquals(r.tempMinC, 1);
  assertEquals(r.lluviaMm, 5);
});

Deno.test("Perfil calibrado: julio pasa a ser mes de helada y la lluvia se reduce a la mitad", async () => {
  const sinCal = await new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, 2515)]), new ClimaFalso(2515), sinEstacion, reloj)
    .execute({ fincaId: 1 }, actor);
  const conCal = await new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, 2515)]), new ClimaFalso(2515), conEstacion(5.5), reloj)
    .execute({ fincaId: 1 }, actor);

  assertEquals(sinCal.ok && conCal.ok, true);
  if (sinCal.ok && conCal.ok) {
    assertEquals(sinCal.value.calibracion, null);
    assertEquals(conCal.value.calibracion?.codigoEstacion, "24035120");
    assertEquals(conCal.value.fuente, "Falso calibrado con IDEAM");
    assertEquals(sinCal.value.resumen.mesesRiesgoHelada, [1]);
    assertEquals(conCal.value.resumen.mesesRiesgoHelada, [1, 7]);
    assertAlmostEquals(conCal.value.resumen.lluviaAnualMm, sinCal.value.resumen.lluviaAnualMm / 2, 1);
  }
});

Deno.test("Perfil: estación a más de 25 km → sin calibrar y con advertencia", async () => {
  const r = await new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, 2515)]), new ClimaFalso(2515), conEstacion(40), reloj)
    .execute({ fincaId: 1 }, actor);

  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.calibracion, null);
    assertEquals(r.value.advertencias.some((a) => a.includes("SIN calibrar")), true);
  }
});

Deno.test("Perfil: si el IDEAM no responde, el perfil sale igual (sin calibrar)", async () => {
  const ideamCaido: INormalesClimatologicasProvider = {
    estacionMasCercana: () =>
      Promise.resolve(Result.err(new ClimaProveedorNoDisponibleError("IDEAM", "timeout")) as Result<never, DomainError>),
  };
  const r = await new ObtenerPerfilClimaticoUseCase(repoCon([finca(1, 2515)]), new ClimaFalso(2515), ideamCaido, reloj)
    .execute({ fincaId: 1 }, actor);

  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.calibracion, null);
    assertEquals(r.value.advertencias[0].startsWith("No se pudo consultar el IDEAM"), true);
  }
});
