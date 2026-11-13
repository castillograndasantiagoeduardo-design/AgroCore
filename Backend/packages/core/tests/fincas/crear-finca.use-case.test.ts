/**
 * Test unitario de CrearFincaUseCase con adaptadores en memoria (sin MySQL).
 */
import { assertEquals } from "@std/assert";
import type { Paginated } from "@agrocore/shared-kernel";
import {
  CrearFincaUseCase,
  type EventoAuditoria,
  type ICultivoRepository,
  Finca,
  type IFincaRepository,
  type IUnitOfWork,
  NombreFinca,
  UbicacionFinca,
  type ContextoSolicitud,
} from "../../src/index.ts";

class RepositorioEnMemoria implements IFincaRepository {
  items: Finca[] = [];
  buscarPorId(id: number) {
    return Promise.resolve(this.items.find((i) => i.id === id) ?? null);
  }
  buscarPorNombre(nombre: string) {
    return Promise.resolve(this.items.find((i) => i.nombre.toLowerCase() === nombre.toLowerCase()) ?? null);
  }
  listar(): Promise<Paginated<Finca>> {
    return Promise.resolve({ items: this.items, total: this.items.length, page: 1, pageSize: 20 });
  }
  guardar(entidad: Finca) {
    const s = entidad.toSnapshot();
    const guardado = Finca.reconstruir({
      id: this.items.length + 1,
      nombre: NombreFinca.reconstruir(s.nombre),
      descripcion: s.descripcion,
      ubicacion: UbicacionFinca.reconstruir(s.latitud, s.longitud, s.altitudM),
      area: entidad.area,
      localidad: s.localidad,
      pais: s.pais,
      region: s.region,
      tieneRiego: s.tieneRiego,
      cultivoActual: s.cultivoActual,
      activo: s.activo,
      creadoEn: new Date(),
    });
    this.items.push(guardado);
    return Promise.resolve(guardado);
  }
}

const unitOfWork: IUnitOfWork = { ejecutar: (trabajo) => trabajo() };
const actor: ContextoSolicitud = { origen: "script", ip: null };

/** Catálogo falso: solo "papa" existe. Al caso de uso le basta saber si la clave está o no. */
const catalogo: ICultivoRepository = {
  listar: () => Promise.resolve([]),
  buscarPorClave: (clave) => Promise.resolve(clave === "papa" ? ({ clave } as never) : null),
};

/** Finca de ejemplo en el centro de Duitama (≈ 2.530 m). */
const fincaDuitama = { nombre: "La Esperanza", latitud: 5.8269, longitud: -73.0297, altitudM: 2530 };

function crearUseCase(eventos: EventoAuditoria[] = [], repo = new RepositorioEnMemoria()) {
  return new CrearFincaUseCase(repo, unitOfWork, { registrar: (e) => Promise.resolve(void eventos.push(e)) }, catalogo);
}

Deno.test("CrearFincaUseCase crea y registra auditoría", async () => {
  const eventos: EventoAuditoria[] = [];
  const result = await crearUseCase(eventos).execute(fincaDuitama, actor);

  assertEquals(result.ok, true);
  assertEquals(eventos.length, 1);
  assertEquals(eventos[0].detalles.antes, null);
});

Deno.test("CrearFincaUseCase rechaza nombre duplicado", async () => {
  const useCase = crearUseCase();

  await useCase.execute(fincaDuitama, actor);
  const result = await useCase.execute({ ...fincaDuitama, nombre: "la esperanza" }, actor);

  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error.code, "FINCA_DUPLICADO");
});

Deno.test("CrearFincaUseCase rechaza nombre inválido sin auditar", async () => {
  const eventos: EventoAuditoria[] = [];
  const result = await crearUseCase(eventos).execute({ ...fincaDuitama, nombre: " " }, actor);

  assertEquals(result.ok, false);
  assertEquals(eventos.length, 0);
});

Deno.test("CrearFincaUseCase acepta fincas en cualquier lugar del mundo", async () => {
  const useCase = crearUseCase();
  const lugares = [
    { nombre: "Nakuru, Kenia", latitud: -0.3031, longitud: 36.08, altitudM: 1850 },
    { nombre: "Córdoba, España", latitud: 37.85, longitud: -4.85, altitudM: 120 },
    { nombre: "Ames, Iowa", latitud: 42.008, longitud: -93.7, altitudM: 290 },
    { nombre: "Punjab, India", latitud: 30.9, longitud: 75.85, altitudM: 250 },
    { nombre: "Chubut, Patagonia", latitud: -43.3, longitud: -65.1, altitudM: 30 },
  ];
  for (const lugar of lugares) {
    const r = await useCase.execute({ ...lugar, localidad: "Lote 1", pais: "X" }, actor);
    assertEquals(r.ok, true, lugar.nombre);
  }
});

Deno.test("CrearFincaUseCase rechaza coordenadas fuera de rango", async () => {
  const eventos: EventoAuditoria[] = [];
  const result = await crearUseCase(eventos).execute({ ...fincaDuitama, latitud: 95, longitud: 10 }, actor);

  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error.code, "FINCA_COORDENADAS_INVALIDAS");
  assertEquals(eventos.length, 0);
});

Deno.test("CrearFincaUseCase acepta altitudes de −500 a 6.000 m y rechaza las imposibles", async () => {
  const useCase = crearUseCase();
  const marMuerto = await useCase.execute({ ...fincaDuitama, nombre: "Jericó", altitudM: -250 }, actor);
  const altiplano = await useCase.execute({ ...fincaDuitama, nombre: "Altiplano", altitudM: 4100 }, actor);
  const imposible = await useCase.execute({ ...fincaDuitama, nombre: "Everest", altitudM: 8000 }, actor);

  assertEquals(marMuerto.ok, true);
  assertEquals(altiplano.ok, true);
  assertEquals(imposible.ok, false);
  if (!imposible.ok) assertEquals(imposible.error.code, "FINCA_ALTITUD_INVALIDA");
});

Deno.test("CrearFincaUseCase guarda el polígono del lote y calcula sus hectáreas", async () => {
  // Cuadrado de ~200 m × 200 m (≈ 4 ha) en Iowa.
  const d = 200 / 111_320;
  const dLon = 200 / (111_320 * Math.cos((42.008 * Math.PI) / 180));
  const area = {
    type: "Polygon" as const,
    coordinates: [[[-93.7, 42.008], [-93.7 + dLon, 42.008], [-93.7 + dLon, 42.008 + d], [-93.7, 42.008 + d], [-93.7, 42.008]] as [number, number][]],
  };
  const r = await crearUseCase().execute({ nombre: "Lote Iowa", latitud: 42.009, longitud: -93.699, area }, actor);

  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.area !== null, true);
    assertEquals(Math.round(r.value.areaHa ?? 0), 4);
  }
});

Deno.test("CrearFincaUseCase rechaza un polígono de más de 100 ha", async () => {
  const d = 0.02; // ~2,2 km de lado ≈ 490 ha
  const area = {
    type: "Polygon" as const,
    coordinates: [[[36.08, -0.3], [36.08 + d, -0.3], [36.08 + d, -0.3 + d], [36.08, -0.3 + d]] as [number, number][]],
  };
  const r = await crearUseCase().execute({ nombre: "Muy grande", latitud: -0.29, longitud: 36.09, area }, actor);

  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "AREA_DEMASIADO_GRANDE");
});

Deno.test("CrearFincaUseCase acepta un cultivo actual que está en el catálogo", async () => {
  const result = await crearUseCase().execute({ ...fincaDuitama, cultivoActual: "papa" }, actor);

  assertEquals(result.ok && result.value.cultivoActual, "papa");
});

Deno.test("CrearFincaUseCase rechaza un cultivo actual fuera del catálogo sin guardar ni auditar", async () => {
  const eventos: EventoAuditoria[] = [];
  const repo = new RepositorioEnMemoria();
  const result = await crearUseCase(eventos, repo).execute({ ...fincaDuitama, cultivoActual: "yuca" }, actor);

  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error.code, "FINCA_CULTIVO_DESCONOCIDO");
  assertEquals(repo.items.length, 0);
  assertEquals(eventos.length, 0);
});
