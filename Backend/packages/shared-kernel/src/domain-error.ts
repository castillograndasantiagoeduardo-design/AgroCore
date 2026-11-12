/**
 * DomainError: clase base inmutable para todo fallo de negocio esperado.
 * No extiende Error: nunca se lanza, se devuelve dentro de Result.err(...).
 */

export class DomainError {
  constructor(
    public readonly code: string,
    public readonly message: string,
  ) {
    Object.freeze(this);
  }
}
