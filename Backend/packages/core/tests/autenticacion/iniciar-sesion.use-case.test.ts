import { assertEquals, assert } from "jsr:@std/assert";
import {
  IniciarSesionUseCase,
  type IPasswordHasher,
  type ITokenService,
  type IUsuarioRepository,
  type TokenPayload,
  Usuario,
} from "../../src/index.ts";
import { Result, type DomainError } from "@duitamacrece/shared-kernel";

class FakeUsuarioRepository implements IUsuarioRepository {
  private readonly usuarios: Usuario[] = [];

  constructor(usuariosIniciales: Usuario[] = []) {
    this.usuarios = [...usuariosIniciales];
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const encontrado = this.usuarios.find((u) => u.email === email);
    return encontrado ?? null;
  }

  async buscarPorId(id: number): Promise<Usuario | null> {
    const encontrado = this.usuarios.find((u) => u.id === id);
    return encontrado ?? null;
  }

  async guardar(usuario: Usuario): Promise<Usuario> {
    const id = usuario.id ?? this.usuarios.length + 1;
    const persistido = Usuario.reconstruir({
      id,
      email: usuario.email,
      passwordHash: usuario.passwordHash,
      rol: usuario.rol,
      activo: usuario.activo,
      creadoEn: usuario.creadoEn ?? new Date(),
    });
    this.usuarios.push(persistido);
    return persistido;
  }
}

class FakePasswordHasher implements IPasswordHasher {
  async hash(password: string): Promise<string> {
    return `hashed_${password}`;
  }

  async comparar(password: string, hash: string): Promise<boolean> {
    return hash === `hashed_${password}`;
  }
}

class FakeTokenService implements ITokenService {
  async firmar(payload: TokenPayload): Promise<string> {
    return `jwt_mock_${payload.usuarioId}_${payload.rol}`;
  }

  async verificar(token: string): Promise<Result<TokenPayload, DomainError>> {
    return Result.ok({ usuarioId: 1, rol: "admin" });
  }
}

function crearEscenario(usuarioOverride?: Partial<{
  id: number;
  email: string;
  passwordHash: string;
  rol: string;
  activo: boolean;
  creadoEn: Date | null;
}>) {
  const usuario = Usuario.reconstruir({
    id: usuarioOverride?.id ?? 1,
    email: usuarioOverride?.email ?? "admin@duitamacrece.co",
    passwordHash: usuarioOverride?.passwordHash ?? "hashed_secreto123",
    rol: usuarioOverride?.rol ?? "admin",
    activo: usuarioOverride?.activo ?? true,
    creadoEn: usuarioOverride?.creadoEn ?? new Date("2026-01-01T00:00:00.000Z"),
  });

  const repo = new FakeUsuarioRepository([usuario]);
  const hasher = new FakePasswordHasher();
  const tokenService = new FakeTokenService();
  const useCase = new IniciarSesionUseCase(repo, hasher, tokenService);

  return { useCase, usuario, repo, hasher, tokenService };
}

Deno.test("Iniciar sesión exitoso devuelve token y datos del usuario", async () => {
  const { useCase } = crearEscenario();

  const resultado = await useCase.execute({
    email: "admin@duitamacrece.co",
    password: "secreto123",
  });

  assert(resultado.ok);
  assertEquals(resultado.value.accessToken, "jwt_mock_1_admin");
  assertEquals(resultado.value.usuario, {
    id: 1,
    email: "admin@duitamacrece.co",
    rol: "admin",
  });
});

Deno.test("Email no registrado devuelve AUTH_CREDENCIALES_INVALIDAS", async () => {
  const { useCase } = crearEscenario();

  const resultado = await useCase.execute({
    email: "inexistente@duitamacrece.co",
    password: "secreto123",
  });

  assert(!resultado.ok);
  assertEquals(resultado.error.code, "AUTH_CREDENCIALES_INVALIDAS");
});

Deno.test("Contraseña incorrecta devuelve AUTH_CREDENCIALES_INVALIDAS", async () => {
  const { useCase } = crearEscenario();

  const resultado = await useCase.execute({
    email: "admin@duitamacrece.co",
    password: "password_incorrecto",
  });

  assert(!resultado.ok);
  assertEquals(resultado.error.code, "AUTH_CREDENCIALES_INVALIDAS");
});

Deno.test("Usuario inactivo devuelve AUTH_USUARIO_INACTIVO", async () => {
  const { useCase } = crearEscenario({ activo: false });

  const resultado = await useCase.execute({
    email: "admin@duitamacrece.co",
    password: "secreto123",
  });

  assert(!resultado.ok);
  assertEquals(resultado.error.code, "AUTH_USUARIO_INACTIVO");
});

