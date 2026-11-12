/**
 * Puerto ITokenService: firma y verifica tokens de acceso.
 * Implementado por JwtTokenService en @duitamacrece/platform.
 */
import type { DomainError, Result } from "@duitamacrece/shared-kernel";

export interface TokenPayload {
  usuarioId: number;
  rol: string;
}

export interface ITokenService {
  firmar(payload: TokenPayload): Promise<string>;
  verificar(token: string): Promise<Result<TokenPayload, DomainError>>;
}
