/**
 * Script interactivo para crear un usuario Administrador en la base de datos.
 *
 * Uso (desde Backend/):
 *   deno run -A --env-file=../.env scripts/crear-admin.ts
 */
import { createContainer, loadConfigFromEnv } from "@duitamacrece/composition";
import { Usuario } from "@duitamacrece/core";
import { LoginSchema, ROLES } from "@duitamacrece/contracts";

console.log("\n👤 === Crear Usuario Administrador (AgroCore) ===\n");

const emailInput = prompt("Introduce el correo electrónico (email):");
if (!emailInput || !emailInput.trim()) {
  console.error("❌ El email no puede estar vacío.");
  Deno.exit(1);
}

const passwordInput = prompt("Introduce la contraseña (no se guardará en logs):");
if (!passwordInput || !passwordInput.trim()) {
  console.error("❌ La contraseña no puede estar vacía.");
  Deno.exit(1);
}

// Validar estructura con el esquema Zod
const parsed = LoginSchema.safeParse({
  email: emailInput,
  password: passwordInput,
});

if (!parsed.success) {
  console.error("❌ Datos inválidos:");
  for (const err of parsed.error.errors) {
    console.error(`   - ${err.path.join(".")}: ${err.message}`);
  }
  Deno.exit(1);
}

const { email, password } = parsed.data;

const config = loadConfigFromEnv();
const container = createContainer(config);

try {
  const existente = await container.usuarioRepository.buscarPorEmail(email);
  if (existente) {
    console.error(`\n❌ Ya existe un usuario registrado con el email: ${email}`);
    Deno.exit(1);
  }

  // Hashear usando el mismo hasher PBKDF2 del login provisto por el contenedor
  const passwordHash = await container.passwordHasher.hash(password);

  const nuevoUsuario = Usuario.crear({
    email,
    passwordHash,
    rol: ROLES.ADMIN,
  });

  const guardado = await container.usuarioRepository.guardar(nuevoUsuario);

  console.log("\n✅ Usuario administrador creado con éxito en la base de datos:");
  console.log(`   - ID: ${guardado.id}`);
  console.log(`   - Email: ${guardado.email}`);
  console.log(`   - Rol: ${guardado.rol}`);
  console.log(`   - Activo: ${guardado.activo}`);
  console.log("\nYa puedes iniciar sesión en POST /api/auth/login usando estas credenciales.\n");
  Deno.exit(0);
} catch (error) {
  console.error(
    "\n❌ Error al guardar el usuario en la base de datos:",
    error instanceof Error ? error.message : error,
  );
  Deno.exit(1);
}

