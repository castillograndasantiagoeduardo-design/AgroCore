/**
 * Puerto para hashing y verificación segura de contraseñas.
 */
export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  comparar(password: string, hash: string): Promise<boolean>;
}

