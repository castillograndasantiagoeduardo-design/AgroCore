# 🧱 Capa 3B: `@duitamacrece/platform`

> Ruta: `Backend/packages/platform`
> Antes de modificar esta capa lee este archivo, `context/rules_architecture.md` y el `MODULE.md` del módulo afectado.

---

## 🎯 Propósito

Adaptador secundario. Provee implementaciones de criptografía, red, correo e IA para los puertos de `core`.

## 📦 ¿Qué contiene?

- `JwtTokenService` → implementa `ITokenService` (HS256).
- Aquí se agregan `Argon2PasswordHasher` (`IPasswordHasher`), `TotpService` (`ITotpService`), `SmtpMailer` (`IMailer`) y `GeminiAsistenteService` cuando el proyecto los necesite.

---

## 🔗 Dependencias (Regla 1)

| ✅ Puede importar de | ❌ PROHIBIDO importar de |
| :--- | :--- |
| `core`, `shared-kernel`, `Shared/contracts` | `database`, `composition`, `api`, `mcp-server` |

---

## 🚫 Restricciones de la Capa

- Cada servicio implementa un puerto definido en `core` (nunca al revés).
- `try/catch` solo para fallos técnicos (timeout SMTP, token mal formado) y se traducen a `Result.err(DomainError)`.
- No lee `Deno.env`: recibe su configuración por constructor desde `composition`.

---

## 🛠️ Forma de Uso

```typescript
export class JwtTokenService implements ITokenService {
  async verificar(token: string): Promise<Result<TokenPayload, DomainError>> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      return Result.ok({ usuarioId: Number(payload.sub), rol: String(payload.rol) });
    } catch {
      return Result.err(new DomainError("TOKEN_INVALIDO", "El token es inválido o ha expirado."));
    }
  }
}
```
