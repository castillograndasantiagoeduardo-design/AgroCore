/**
 * LimitadorConcurrencia: ejecuta como máximo `max` tareas a la vez; el resto espera en una cola FIFO.
 * Sirve para que un proveedor lento (p. ej. los bloques de NDVI) no bloquee a otro (la cobertura).
 */
export class LimitadorConcurrencia {
  private activas = 0;
  private readonly cola: (() => void)[] = [];

  constructor(private readonly max: number) {
    if (!Number.isInteger(max) || max < 1) throw new RangeError("max debe ser un entero >= 1");
  }

  async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activas >= this.max) {
      // Espera su turno; quien termina le traspasa su cupo (no decrementa), así se respeta el orden FIFO.
      await new Promise<void>((liberar) => this.cola.push(liberar));
    } else {
      this.activas++;
    }
    try {
      return await fn();
    } finally {
      const siguiente = this.cola.shift();
      if (siguiente) siguiente();
      else this.activas--;
    }
  }
}
