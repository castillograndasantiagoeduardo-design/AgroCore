/**
 * Caso de Uso: Iniciar sesión de usuario con credenciales (email y password).
 */
import type { LoginInput, LoginOutput } from "@duitamacrece/contracts";
import { type DomainError, Result } from "@duitamacrece/shared-kernel";
import type { IUsuarioRepository } from "../../domain/repositories/usuario.repository.ts";
import type { IPasswordHasher } from "../ports/password-hasher.port.ts";
import type { ITokenService } from "../ports/token-service.port.ts";
import {
  CredencialesInvalidasError,
  UsuarioInactivoError,
} from "../../domain/errors/auth.errors.ts";

export class IniciarSesionUseCase {
  constructor(
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ITokenService,
  ) {}

  async execute(input: LoginInput): Promise<Result<LoginOutput, DomainError>> {
    const usuario = await this.usuarioRepo.buscarPorEmail(input.email);
    if (!usuario) {
      return Result.err(new CredencialesInvalidasError());
    }

    const passwordValido = await this.passwordHasher.comparar(
      input.password,
      usuario.passwordHash,
    );
    if (!passwordValido) {
      return Result.err(new CredencialesInvalidasError());
    }

    if (!usuario.activo) {
      return Result.err(new UsuarioInactivoError());
    }

    if (usuario.id === null) {
      return Result.err(new CredencialesInvalidasError());
    }

    const accessToken = await this.tokenService.firmar({
      usuarioId: usuario.id,
      rol: usuario.rol,
    });

    return Result.ok({
      accessToken,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  }
}

