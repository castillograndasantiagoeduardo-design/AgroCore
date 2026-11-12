/**
 * Errores de dominio del módulo de autenticación.
 */
import { DomainError } from "@duitamacrece/shared-kernel";

export class CredencialesInvalidasError extends DomainError {
  constructor() {
    super("AUTH_CREDENCIALES_INVALIDAS", "Credenciales inválidas.");
  }
}

export class UsuarioInactivoError extends DomainError {
  constructor() {
    super("AUTH_USUARIO_INACTIVO", "El usuario se encuentra inactivo.");
  }
}

