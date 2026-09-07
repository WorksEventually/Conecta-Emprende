/**
 * Bootstrap de SUPER_ADMIN de producción.
 *
 * Uso:
 *   ADMIN_EMAIL=admin@tu-dominio.com \
 *   ADMIN_NAME="Nombre Admin" \
 *   ADMIN_PASSWORD='ContraseñaSegura!2026' \
 *   npx tsx scripts/bootstrap_production_admin.ts
 *
 * Variables:
 *   - ADMIN_EMAIL (obligatoria)
 *   - ADMIN_PASSWORD (obligatoria, mínimo 12 caracteres y al menos 1 número y 1 símbolo)
 *   - ADMIN_NAME (opcional, por defecto "Admin")
 *   - ADMIN_RESET_PASSWORD=true (opcional, regenera la contraseña si el usuario ya existe)
 *
 * Reglas:
 *   - Crea el usuario si no existe; lo actualiza si existe (idempotente).
 *   - Asigna role=SUPER_ADMIN en la tabla User y crea/actualiza RoleAssignment(SUPER_ADMIN).
 *   - Nunca imprime la contraseña en claro. Usa `console.log` solo para IDs.
 *   - Si ADMIN_RESET_PASSWORD=true y ADMIN_PASSWORD es provisional, cambia la contraseña.
 *   - El proceso debe ejecutarse una sola vez por entorno. No usar seed.ts aquí.
 *
 * Prerrequisito: migraciones aplicadas (npx prisma migrate deploy).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const PASSWORD_MIN = 12;
const PASSWORD_REGEX = /[0-9]/;
const SYMBOL_REGEX = /[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]/;

function readEnv(): { email: string; password: string; name: string; reset: boolean } {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "Admin").trim() || "Admin";
  const reset = (process.env.ADMIN_RESET_PASSWORD ?? "").toLowerCase() === "true";

  if (!email) {
    throw new Error("ADMIN_EMAIL es obligatorio. Ejemplo: admin@tu-dominio.com");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL no tiene un formato válido.");
  }
  if (!password) {
    throw new Error("ADMIN_PASSWORD es obligatorio. Define una contraseña segura.");
  }
  if (password.length < PASSWORD_MIN) {
    throw new Error(`ADMIN_PASSWORD debe tener al menos ${PASSWORD_MIN} caracteres.`);
  }
  if (!PASSWORD_REGEX.test(password) || !SYMBOL_REGEX.test(password)) {
    throw new Error("ADMIN_PASSWORD debe incluir al menos un número y un símbolo.");
  }
  if (email.endsWith("@conecta.test")) {
    throw new Error(
      "ADMIN_EMAIL usa el dominio de pruebas @conecta.test. Usa un correo real de producción.",
    );
  }
  return { email, password, name, reset };
}

async function main(): Promise<void> {
  const { email, password, name, reset } = readEnv();

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email } });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: Role.SUPER_ADMIN,
      password: passwordHash,
      name,
      emailVerified: new Date(),
      isSynthetic: false,
    },
    create: {
      email,
      name,
      role: Role.SUPER_ADMIN,
      password: passwordHash,
      emailVerified: new Date(),
      isSynthetic: false,
    },
  });

  await prisma.roleAssignment.upsert({
    where: { userId_role: { userId: user.id, role: Role.SUPER_ADMIN } },
    update: {},
    create: { userId: user.id, role: Role.SUPER_ADMIN },
  });

  const action = existing
    ? reset
      ? "updated-with-new-password"
      : "updated-existing-user"
    : "created";

  console.log("✓ SUPER_ADMIN listo para producción");
  console.log(`  userId: ${user.id}`);
  console.log(`  email:  ${email}`);
  console.log(`  action: ${action}`);
  console.log("");
  console.log("Pasos siguientes:");
  console.log("  1) Si la contraseña fue provisional, cámbiala desde la cuenta o reejecuta con ADMIN_RESET_PASSWORD=true.");
  console.log("  2) Elimina las variables ADMIN_* del entorno (Render/Neon).");
  console.log("  3) Verifica el acceso iniciando sesión antes de abrir el entorno al público.");
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("✗ Error creando SUPER_ADMIN:", message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
