/**
 * Esquemas de validación Zod para autenticación (Login).
 */
import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().trim().email("Formato de correo electrónico inválido").toLowerCase(),
  password: z.string().min(1, "La contraseña es requerida"),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const LoginUsuarioSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  rol: z.string(),
});

export const LoginOutputSchema = z.object({
  accessToken: z.string().min(1),
  usuario: LoginUsuarioSchema,
});

export type LoginOutput = z.infer<typeof LoginOutputSchema>;

