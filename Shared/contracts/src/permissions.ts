/**
 * Catálogo oficial de permisos RBAC.
 * add_module agrega aquí los permisos de cada módulo.
 */

export const PERMISSIONS = {
  FINCAS_LEER: "fincas:leer",
  FINCAS_CREAR: "fincas:crear",
  CLIMA_LEER: "clima:leer",
  CULTIVOS_LEER: "cultivos:leer",
  ROTACIONES_COMPARAR: "rotaciones:comparar",
  // @scaffold:permissions
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
