/**
 * Entidad Usuario de autenticación.
 */

export interface UsuarioProps {
  id: number | null;
  email: string;
  passwordHash: string;
  rol: string;
  activo: boolean;
  creadoEn: Date | null;
}

export class Usuario {
  private constructor(private readonly props: UsuarioProps) {}

  static crear(props: {
    email: string;
    passwordHash: string;
    rol?: string;
  }): Usuario {
    return new Usuario({
      id: null,
      email: props.email.trim().toLowerCase(),
      passwordHash: props.passwordHash,
      rol: props.rol ?? "admin",
      activo: true,
      creadoEn: null,
    });
  }

  static reconstruir(props: UsuarioProps): Usuario {
    return new Usuario(props);
  }

  get id(): number | null {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get rol(): string {
    return this.props.rol;
  }

  get activo(): boolean {
    return this.props.activo;
  }

  get creadoEn(): Date | null {
    return this.props.creadoEn;
  }
}

