/**
 * Catálogo oficial de roles y su matriz de permisos.
 */
import { PERMISSIONS, type Permission } from "./permissions.ts";

export const ROLES = {
  ADMIN: "admin",
} as const;

export type Rol = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_PERMISSIONS: Record<Rol, readonly Permission[]> = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
};

export function tienePermiso(rol: string, permiso: Permission): boolean {
  const permisos = ROLE_PERMISSIONS[rol as Rol];
  return permisos ? permisos.includes(permiso) : false;
}
