# 📦 Módulo `autenticacion`

> Antes de modificar este módulo lee el `LAYER.md` de la capa que vas a tocar.

---

## 🎯 Propósito

Gestiona la autenticación de usuarios del sistema (inicio de sesión mediante credenciales email/password y generación de tokens JWT HS256).

---

## 🧩 Dominio

| Elemento | Nombre | Descripción |
| :--- | :--- | :--- |
| Entidad | `Usuario` | `id`, `email`, `passwordHash`, `rol`, `activo`, `creadoEn`. Se reconstruye con `Usuario.reconstruir()`. |
| Puerto | `IUsuarioRepository` | `buscarPorEmail(email)`, `buscarPorId(id)`. |
| Puerto | `IPasswordHasher` | `hash(password)`, `comparar(password, hash)`. |
| Puerto | `ITokenService` | `firmar(payload)`, `verificar(token)`. |

## ⚠️ Errores de Dominio

| Código | Clase | HTTP |
| :--- | :--- | :--- |
| `AUTH_CREDENCIALES_INVALIDAS` | `CredencialesInvalidasError` | 401 |
| `AUTH_USUARIO_INACTIVO` | `UsuarioInactivoError` | 422 |

## ⚙️ Casos de Uso

| Caso de uso | Clave en `AppContainer` | Puertos inyectados | Permiso | Audita |
| :--- | :--- | :--- | :--- | :--- |
| `IniciarSesionUseCase` | `iniciarSesion` | `IUsuarioRepository`, `IPasswordHasher`, `ITokenService` | Ninguno (público) | ❌ |

---

## 📁 Archivos por Capa

### 1. Contrato — Shared/contracts
- `Shared/contracts/src/auth.schema.ts` (`LoginSchema`, `LoginOutputSchema`)

### 2. Dominio y Aplicación — core
- `Backend/packages/core/src/modules/autenticacion/domain/entities/usuario.entity.ts`
- `Backend/packages/core/src/modules/autenticacion/domain/errors/auth.errors.ts`
- `Backend/packages/core/src/modules/autenticacion/domain/repositories/usuario.repository.ts`
- `Backend/packages/core/src/modules/autenticacion/application/ports/password-hasher.port.ts`
- `Backend/packages/core/src/modules/autenticacion/application/ports/token-service.port.ts`
- `Backend/packages/core/src/modules/autenticacion/application/use-cases/iniciar-sesion.use-case.ts`
- `Backend/packages/core/tests/autenticacion/iniciar-sesion.use-case.test.ts`

### 3. Infraestructura — database y platform
- `Backend/packages/database/src/schema/usuarios.schema.ts`
- `Backend/packages/database/src/mappers/usuario.mapper.ts`
- `Backend/packages/database/src/repositories/mysql-usuario.repository.ts`
- `Docs/migraciones/003_usuarios.sql`
- `Backend/packages/platform/src/pbkdf2-password-hasher.ts`
- `Backend/packages/platform/src/jwt-token-service.ts`

### 4. Ensamblaje — composition
- `Backend/packages/composition/src/container.ts` → `iniciarSesion`

### 5. Entrada — apps/api
- `Backend/apps/api/src/controllers/auth.controller.ts`
- `Backend/apps/api/src/routes/auth.routes.ts` → `POST /api/auth/login`
- `Http/auth.http`

---

## 🚫 Restricciones

- `core` no conoce algoritmos criptográficos concretos ni bases de datos: solo los puertos `IPasswordHasher`, `ITokenService` e `IUsuarioRepository` (Regla 2).
- Ningún fallo de login usa `throw`: retorna `Result.err(new CredencialesInvalidasError())` o `Result.err(new UsuarioInactivoError())` (Regla 3).
- Las contraseñas nunca se guardan en texto claro ni se exponen en logs o respuestas.

