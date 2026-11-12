/**
 * Test unitario de CrearFincaUseCase con adaptadores en memoria (sin MySQL).
 */
import { assertEquals } from "@std/assert";
import type { Paginated } from "@duitamacrece/shared-kernel";
import {
  CrearFincaUseCase,
  type EventoAuditoria,
  type ICultivoRepository,
  Finca,
  type IFincaRepository,
  type IUnitOfWork,
  NombreFinca,
  UbicacionFinca,
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
      vereda: s.vereda,
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
const actor = { usuarioId: 1, rol: "admin", ip: null };

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

Deno.test("CrearFincaUseCase rechaza una finca fuera de Duitama (Bogotá)", async () => {
  const eventos: EventoAuditoria[] = [];
  const result = await crearUseCase(eventos).execute({ ...fincaDuitama, latitud: 4.711, longitud: -74.0721 }, actor);

  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error.code, "FINCA_FUERA_DE_AREA");
  assertEquals(eventos.length, 0);
});

Deno.test("CrearFincaUseCase rechaza una altitud imposible para Duitama", async () => {
  const result = await crearUseCase().execute({ ...fincaDuitama, altitudM: 800 }, actor);

  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error.code, "FINCA_ALTITUD_INVALIDA");
});

Deno.test("CrearFincaUseCase calcula la zona altitudinal", async () => {
  const useCase = crearUseCase();
  const valle = await useCase.execute({ ...fincaDuitama, nombre: "Valle", altitudM: 2530 }, actor);
  const ladera = await useCase.execute({ ...fincaDuitama, nombre: "Ladera", altitudM: 2800 }, actor);
  const alta = await useCase.execute({ ...fincaDuitama, nombre: "Alta", altitudM: 3200 }, actor);
  const sinAltitud = await useCase.execute({ ...fincaDuitama, nombre: "Sin dato", altitudM: undefined }, actor);

  assertEquals(valle.ok && valle.value.zonaAltitudinal, "valle");
  assertEquals(ladera.ok && ladera.value.zonaAltitudinal, "ladera");
  assertEquals(alta.ok && alta.value.zonaAltitudinal, "alta");
  assertEquals(sinAltitud.ok && sinAltitud.value.zonaAltitudinal, null);
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
