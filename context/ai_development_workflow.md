# 🤖 Flujo de Trabajo para Asistentes de IA (AI Development Workflow)

Protocolo que la IA debe seguir estrictamente al agregar o modificar funcionalidades. El orden de trabajo siempre es **de adentro hacia afuera**.

> 💡 Para crear un módulo nuevo completo usa la herramienta MCP **`add_module`**: genera los archivos de los 7 pasos, el `MODULE.md` y actualiza `CLAUDE.md` / `GEMINI.md`.

---

## 📋 Los 7 Pasos para Agregar una Funcionalidad

### Paso 1: Contrato (`Shared/contracts`)
- Crea el esquema Zod de entrada/salida en `src/<modulo>.schema.ts` y expórtalo en `src/index.ts`.
- Si aplica, agrega el permiso en `permissions.ts` y la acción en `auditoria.catalogo.ts`.

### Paso 2: Dominio (`Backend/packages/core/.../domain`)
- Crea o actualiza la Entidad, los Value Objects, los errores de dominio (`DomainError`) y la firma del método en la interfaz `I*Repository`.

### Paso 3: Caso de Uso (`Backend/packages/core/.../application/use-cases`)
- Implementa el caso de uso inyectando los puertos necesarios y el `IAuditor`.
- Firma: `execute(input, contexto): Promise<Result<Output, DomainError>>`.
- Escribe su test unitario en `core/tests/`.

### Paso 4: Infraestructura (`Backend/packages/database` o `platform`)
- Si agregaste tablas o métodos al repositorio, actualiza el esquema Drizzle, el Mapper (`toDomain` / `toPersistence`) y el repositorio `MySql*Repository`.
- Agrega la tabla a `Docs/ddl.sql`.

### Paso 5: Ensamblaje (`Backend/packages/composition`)
- Registra el nuevo caso de uso en `createContainer` (`container.ts`).

### Paso 6: Entrada (`Backend/apps/api` y/o `apps/mcp-server`)
- Crea la ruta en Hono y el método del controlador usando `safeHandler` + `presentResult`.
- Y/o registra la Tool MCP con `ToolGateway.register(...)`.
- Agrega las pruebas en `Http/<modulo>.http`.

### Paso 7: Interfaz (`Frontend/src/features/<modulo>`)
- Conecta el servicio HTTP en `api/`, el hook en `hooks/`, el componente visual en `components/` y los tipos de vista en `types/`.

---

## ✅ Checklist de Verificación de Calidad

Antes de dar por terminada una tarea, verifica:

- [ ] ¿Leí el `LAYER.md` de cada capa modificada y el `MODULE.md` del módulo?
- [ ] ¿Ninguna importación viola la matriz de la Regla 1?
- [ ] ¿`core` sigue sin importar `drizzle-orm`, `mysql2`, `hono`, `jose`, `argon2`, `nodemailer` ni `Deno.env`?
- [ ] ¿Todo fallo de negocio retorna `Result.err(new DomainError(...))` en lugar de `throw`?
- [ ] ¿El caso de uso está registrado en `createContainer` y no hay `new` de repositorios/casos de uso en `apps/`?
- [ ] ¿Toda entrada externa pasa por un esquema Zod de `@duitamacrece/contracts`?
- [ ] ¿Los casos de uso que mutan estado inyectan `IAuditor` con `{ antes, despues }`?
- [ ] ¿Se respetan las tablas append-only (sin `UPDATE`/`DELETE`)?
- [ ] ¿Pasan `deno task check` y `deno task test`?
- [ ] ¿Se actualizó `Http/<modulo>.http` y el `MODULE.md`?
