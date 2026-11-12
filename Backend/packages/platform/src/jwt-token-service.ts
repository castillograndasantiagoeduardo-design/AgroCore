/**
 * JwtTokenService: implementa ITokenService con JWT HS256 (jose).
 */
import { jwtVerify, SignJWT } from "jose";
import type { ITokenService, TokenPayload } from "@duitamacrece/core";
import { DomainError, Result } from "@duitamacrece/shared-kernel";

export class JwtTokenService implements ITokenService {
  private readonly key: Uint8Array;

  constructor(secret: string, private readonly expiracion = "15m") {
    this.key = new TextEncoder().encode(secret);
  }

  async firmar(payload: TokenPayload): Promise<string> {
    return await new SignJWT({ rol: payload.rol })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(payload.usuarioId))
      .setIssuedAt()
      .setExpirationTime(this.expiracion)
      .sign(this.key);
  }

  async verificar(token: string): Promise<Result<TokenPayload, DomainError>> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      return Result.ok({ usuarioId: Number(payload.sub), rol: String(payload.rol) });
    } catch {
      return Result.err(new DomainError("TOKEN_INVALIDO", "El token es inválido o ha expirado."));
    }
  }
}
